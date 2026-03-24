const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const LEGACY_PBKDF2_ITERATIONS = 100000;

function normalizeColumnShells(columns = []) {
  return JSON.stringify(columns.map((col) => ({
    id: col.id || "",
    title: col.title || "",
    isDone: !!col.isDone,
    isArchive: !!col.isArchive,
  })));
}

function flattenCards(state = {}) {
  const byId = new Map();
  for (const col of state.columns || []) {
    (col.cards || []).forEach((card, index) => {
      byId.set(card.id, { card, colId: col.id, index });
    });
  }
  return byId;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function comparableCardContent(card = {}) {
  return {
    title: card.title || "",
    description: card.description || "",
    tags: card.tags || [],
    due: card.due || "",
    assignedUser: card.assignedUser || null,
    attachments: card.attachments || [],
    createdBy: card.createdBy || "",
    createdAt: card.createdAt || "",
    contentChangedAt: card.contentChangedAt || "",
  };
}

function normalizeComments(comments = []) {
  if (!Array.isArray(comments)) return [];
  return comments.map((comment) => ({
    id: comment.id || "",
    text: comment.text || "",
    author: comment.author || "",
    createdAt: comment.createdAt || "",
    updatedAt: comment.updatedAt || comment.createdAt || "",
    replies: normalizeComments(comment.replies || []),
  }));
}

function normalizePublicUserRecord(user = {}) {
  return {
    name: (user.name || "").trim(),
    avatarUrl: user.avatarUrl || "",
    avatarKey: user.avatarKey || "",
    isAdmin: !!user.isAdmin,
  };
}

function normalizeLegacyUserRecord(user = {}) {
  return {
    name: (user.name || "").trim(),
    pinCode: user.pinCode || "",
    avatarUrl: user.avatarUrl || "",
    avatarKey: user.avatarKey || "",
  };
}

function commentsChangeAllowed(oldComments = [], newComments = [], currentUser = "") {
  const oldList = normalizeComments(oldComments);
  const newList = normalizeComments(newComments);
  const oldById = new Map(oldList.map((comment) => [comment.id, comment]));
  const newById = new Map(newList.map((comment) => [comment.id, comment]));

  for (const oldComment of oldList) {
    const next = newById.get(oldComment.id);
    if (!next) {
      if ((oldComment.author || "").trim() !== currentUser) return false;
      continue;
    }
    if ((next.author || "").trim() !== (oldComment.author || "").trim()) return false;
    if ((next.createdAt || "") !== (oldComment.createdAt || "")) return false;
    if (stableStringify(oldComment) !== stableStringify(next) && (oldComment.author || "").trim() !== currentUser) {
      return false;
    }
  }

  for (const newComment of newList) {
    if (oldById.has(newComment.id)) continue;
    if ((newComment.author || "").trim() !== currentUser) return false;
  }

  const preservedOldIds = oldList.filter((comment) => newById.has(comment.id)).map((comment) => comment.id);
  const preservedNewIds = newList.filter((comment) => oldById.has(comment.id)).map((comment) => comment.id);
  if (stableStringify(preservedOldIds) !== stableStringify(preservedNewIds)) return false;

  return true;
}

function getBoardId(request, url) {
  return request.headers.get("X-Board-ID") || url.searchParams.get("boardId") || "default";
}

function getUserToken(request, url) {
  return request.headers.get("X-User-Token") || url.searchParams.get("token") || "";
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function hashPin(pinCode, saltBase64) {
  const combined = `${saltBase64}:${pinCode}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(combined));
  return `sha256:${bytesToBase64(new Uint8Array(digest))}`;
}

async function hashPinLegacyPbkdf2(pinCode, saltBase64) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pinCode),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: base64ToBytes(saltBase64),
      iterations: LEGACY_PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256
  );
  return `pbkdf2:${bytesToBase64(new Uint8Array(bits))}`;
}

async function verifyPin(pinCode, saltBase64, storedHash) {
  if (!storedHash) return false;
  if (storedHash.startsWith("sha256:")) {
    return (await hashPin(pinCode, saltBase64)) === storedHash;
  }
  if (storedHash.startsWith("pbkdf2:")) {
    return (await hashPinLegacyPbkdf2(pinCode, saltBase64)) === storedHash;
  }
  const legacyRaw = await hashPinLegacyPbkdf2(pinCode, saltBase64);
  return legacyRaw.slice("pbkdf2:".length) === storedHash;
}

async function makeCredential(pinCode) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const saltBase64 = bytesToBase64(saltBytes);
  const pinHash = await hashPin(pinCode, saltBase64);
  return { pinHash, pinSalt: saltBase64 };
}

async function readBoardRow(env, boardId) {
  return env.DB.prepare("SELECT data FROM boards WHERE id = ?").bind(boardId).first();
}

async function listPublicUsers(env, boardId) {
  const result = await env.DB.prepare(
    "SELECT name, avatar_url AS avatarUrl, avatar_key AS avatarKey, is_admin AS isAdmin FROM board_users WHERE board_id = ? ORDER BY name COLLATE NOCASE"
  ).bind(boardId).all();
  return (result.results || []).map(normalizePublicUserRecord);
}

async function getPublicUser(env, boardId, name) {
  const row = await env.DB.prepare(
    "SELECT name, avatar_url AS avatarUrl, avatar_key AS avatarKey, is_admin AS isAdmin FROM board_users WHERE board_id = ? AND name = ?"
  ).bind(boardId, name).first();
  return row ? normalizePublicUserRecord(row) : null;
}

async function getUserCredential(env, boardId, name) {
  return env.DB.prepare(
    "SELECT name, pin_hash AS pinHash, pin_salt AS pinSalt FROM board_user_credentials WHERE board_id = ? AND name = ?"
  ).bind(boardId, name).first();
}

async function upsertUserRecord(env, boardId, user, pinCode = null) {
  const normalized = normalizePublicUserRecord(user);
  if (!normalized.name) throw new Error("User name is required");
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT OR REPLACE INTO board_users (board_id, name, avatar_url, avatar_key, is_admin, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(boardId, normalized.name, normalized.avatarUrl, normalized.avatarKey, normalized.isAdmin ? 1 : 0, now).run();

  if (typeof pinCode === "string" && pinCode.trim()) {
    const { pinHash, pinSalt } = await makeCredential(pinCode.trim());
    await env.DB.prepare(
      "INSERT OR REPLACE INTO board_user_credentials (board_id, name, pin_hash, pin_salt, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(boardId, normalized.name, pinHash, pinSalt, now).run();
  }
}

async function renameUserRecords(env, boardId, previousName, nextName) {
  if (!previousName || previousName === nextName) return;
  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE board_users SET name = ?, updated_at = ? WHERE board_id = ? AND name = ?"
  ).bind(nextName, now, boardId, previousName).run();
  await env.DB.prepare(
    "UPDATE board_user_credentials SET name = ?, updated_at = ? WHERE board_id = ? AND name = ?"
  ).bind(nextName, now, boardId, previousName).run();
}

async function deleteUserRecords(env, boardId, name) {
  await env.DB.prepare("DELETE FROM board_users WHERE board_id = ? AND name = ?").bind(boardId, name).run();
  await env.DB.prepare("DELETE FROM board_user_credentials WHERE board_id = ? AND name = ?").bind(boardId, name).run();
}

async function createSession(env, boardId, userName) {
  const token = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  await env.DB.prepare(
    "INSERT OR REPLACE INTO board_sessions (token, board_id, user_name, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(token, boardId, userName, new Date(now).toISOString(), expiresAt).run();
  return { token, expiresAt };
}

async function getSessionUser(env, boardId, token) {
  if (!token) return "";
  const row = await env.DB.prepare(
    "SELECT user_name AS userName, expires_at AS expiresAt FROM board_sessions WHERE token = ? AND board_id = ?"
  ).bind(token, boardId).first();
  if (!row) return "";
  if (row.expiresAt && Date.parse(row.expiresAt) <= Date.now()) {
    await env.DB.prepare("DELETE FROM board_sessions WHERE token = ?").bind(token).run();
    return "";
  }
  return (row.userName || "").trim();
}

async function isUserAdmin(env, boardId, name) {
  const user = await getPublicUser(env, boardId, name);
  return !!user?.isAdmin;
}

async function ensureUserTablesFromLegacyBoard(env, boardId, state) {
  const publicUsers = await listPublicUsers(env, boardId);
  if (publicUsers.length > 0) return publicUsers;

  const legacyUsers = Array.isArray(state?.users) ? state.users.map(normalizeLegacyUserRecord).filter((user) => user.name) : [];
  if (!legacyUsers.length) return [];

  for (const legacyUser of legacyUsers) {
    await upsertUserRecord(env, boardId, legacyUser, legacyUser.pinCode || null);
  }
  return listPublicUsers(env, boardId);
}

function findLegacyUser(state, name) {
  if (!Array.isArray(state?.users)) return null;
  return state.users
    .map(normalizeLegacyUserRecord)
    .find((user) => user.name === name) || null;
}

function sanitizedState(state = {}, publicUsers = []) {
  return {
    ...state,
    users: publicUsers.map(normalizePublicUserRecord),
  };
}

async function loadSanitizedBoard(env, boardId) {
  const row = await readBoardRow(env, boardId);
  const rawState = row?.data ? JSON.parse(row.data) : null;
  if (!rawState) return null;
  const publicUsers = await ensureUserTablesFromLegacyBoard(env, boardId, rawState);
  return sanitizedState(rawState, publicUsers);
}

async function persistBoardState(env, boardId, state) {
  const data = JSON.stringify(state);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO boards (id, data, updated_at) VALUES (?, ?, ?)"
  ).bind(boardId, data, new Date().toISOString()).run();
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Invalid JSON");
  }
}

function jsonResponse(body, headers, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+/g, "/");
    const method = request.method;

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Board-ID, X-User-Token",
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const boardId = getBoardId(request, url);

    try {
      if (path === "/load" && method === "GET") {
        const state = await loadSanitizedBoard(env, boardId);
        return jsonResponse(state, headers);
      }

      if (path === "/auth" && method === "POST") {
        const body = await parseJson(request);
        const name = (body.name || "").trim();
        const pinCode = (body.pinCode || "").trim();
        if (!name || !pinCode) {
          return jsonResponse({ error: "Name and PIN are required." }, headers, 400);
        }

        const credential = await getUserCredential(env, boardId, name);
        if (credential) {
          const isValid = await verifyPin(pinCode, credential.pinSalt, credential.pinHash);
          if (!isValid) {
            return jsonResponse({ error: "Incorrect password for this name" }, headers, 403);
          }
        } else {
          const existingRow = await readBoardRow(env, boardId);
          const existingState = existingRow?.data ? JSON.parse(existingRow.data) : null;
          const legacyUser = findLegacyUser(existingState, name);
          if (legacyUser) {
            if ((legacyUser.pinCode || "").trim() !== pinCode) {
              return jsonResponse({ error: "Incorrect password for this name" }, headers, 403);
            }
            await upsertUserRecord(env, boardId, legacyUser, pinCode);
          } else {
            await upsertUserRecord(env, boardId, { name }, pinCode);
          }
        }

        const publicUser = await getPublicUser(env, boardId, name) || { name, avatarUrl: "", avatarKey: "", isAdmin: false };
        const session = await createSession(env, boardId, name);
        return jsonResponse({
          success: true,
          user: publicUser,
          token: session.token,
          expiresAt: session.expiresAt,
          isAdmin: !!publicUser.isAdmin,
        }, headers);
      }

      if (path === "/user" && method === "POST") {
        const currentUser = await getSessionUser(env, boardId, getUserToken(request, url));
        if (!currentUser) {
          return jsonResponse({ error: "Unauthorized" }, headers, 401);
        }

        const body = await parseJson(request);
        const previousName = (body.previousName || "").trim();
        const nextName = (body.name || "").trim();
        const pinCode = typeof body.pinCode === "string" ? body.pinCode.trim() : "";
        const isAdmin = await isUserAdmin(env, boardId, currentUser);

        if (!nextName) {
          return jsonResponse({ error: "User name is required." }, headers, 400);
        }

        if (!isAdmin) {
          if (previousName && previousName !== currentUser) {
            return jsonResponse({ error: "Only admin can modify other users." }, headers, 403);
          }
          if (nextName !== currentUser) {
            return jsonResponse({ error: "Only admin can rename users." }, headers, 403);
          }
          if (pinCode) {
            return jsonResponse({ error: "Only admin can change passwords." }, headers, 403);
          }
        }

        const previousUser = previousName ? await getPublicUser(env, boardId, previousName) : null;
        if (previousUser?.isAdmin && previousName && previousName !== nextName) {
          return jsonResponse({ error: "Admin user name cannot be renamed." }, headers, 403);
        }
        if (!isAdmin && body.isAdmin !== undefined) {
          return jsonResponse({ error: "Only admin can change admin role." }, headers, 403);
        }
        const existingTargetUser = await getPublicUser(env, boardId, nextName);
        const nextUserPayload = {
          ...body,
          isAdmin: body.isAdmin !== undefined
            ? !!body.isAdmin
            : !!(previousUser?.isAdmin || existingTargetUser?.isAdmin),
        };

        if (isAdmin && previousName && previousName !== nextName) {
          await renameUserRecords(env, boardId, previousName, nextName);
        }
        await upsertUserRecord(env, boardId, nextUserPayload, pinCode || null);

        return jsonResponse({ success: true, users: await listPublicUsers(env, boardId) }, headers);
      }

      if (path === "/user" && method === "DELETE") {
        const currentUser = await getSessionUser(env, boardId, getUserToken(request, url));
        if (!currentUser || !(await isUserAdmin(env, boardId, currentUser))) {
          return jsonResponse({ error: "Only admin can delete users." }, headers, 403);
        }
        const name = (url.searchParams.get("name") || "").trim();
        if (!name) {
          return jsonResponse({ error: "Missing user name." }, headers, 400);
        }
        if (await isUserAdmin(env, boardId, name)) {
          return jsonResponse({ error: "Admin user cannot be deleted." }, headers, 403);
        }
        await deleteUserRecords(env, boardId, name);
        return jsonResponse({ success: true, users: await listPublicUsers(env, boardId) }, headers);
      }

      if (path === "/save" && method === "POST") {
        const currentUser = await getSessionUser(env, boardId, getUserToken(request, url));
        if (!currentUser) {
          return jsonResponse({ error: "Unauthorized" }, headers, 401);
        }

        const body = await parseJson(request);
        const existingRow = await readBoardRow(env, boardId);
        const existingRawState = existingRow?.data ? JSON.parse(existingRow.data) : null;
        if (existingRawState) {
          await ensureUserTablesFromLegacyBoard(env, boardId, existingRawState);
        }
        const existingState = existingRawState
          ? sanitizedState(existingRawState, await listPublicUsers(env, boardId))
          : { columns: [], users: [] };
        const sentUsers = Array.isArray(body.users) ? body.users.map(normalizePublicUserRecord) : [];
        let currentUsers = await listPublicUsers(env, boardId);
        if (!existingRawState && Array.isArray(body.users) && body.users.length) {
          for (const legacyUser of body.users.map(normalizeLegacyUserRecord).filter((user) => user.name)) {
            await upsertUserRecord(env, boardId, legacyUser, legacyUser.pinCode || null);
          }
          currentUsers = await listPublicUsers(env, boardId);
        }
        const sentUsersStable = stableStringify(sentUsers);
        const currentUsersStable = stableStringify(currentUsers);
        const isAdmin = await isUserAdmin(env, boardId, currentUser);

        if (sentUsersStable !== currentUsersStable && !isAdmin) {
          return jsonResponse({ error: "Only admin can modify users list." }, headers, 403);
        }

        if (!isAdmin) {
          if (normalizeColumnShells(existingState.columns) !== normalizeColumnShells(body.columns)) {
            return jsonResponse({ error: "Only admin can modify board structure." }, headers, 403);
          }

          const oldCards = flattenCards(existingState);
          const newCards = flattenCards(body);

          for (const [cardId, oldEntry] of oldCards.entries()) {
            const newEntry = newCards.get(cardId);
            const oldOwner = (oldEntry.card.createdBy || "").trim();
            const oldAssignee = (oldEntry.card.assignedUser?.name || "").trim();

            if (!newEntry) {
              if (oldOwner !== currentUser) {
                return jsonResponse({ error: "You can edit or delete only your own cards." }, headers, 403);
              }
              continue;
            }

            const commentsChanged =
              stableStringify(normalizeComments(oldEntry.card.comments)) !==
              stableStringify(normalizeComments(newEntry.card.comments));

            if (commentsChanged && !commentsChangeAllowed(oldEntry.card.comments, newEntry.card.comments, currentUser)) {
              return jsonResponse({ error: "You can edit or delete only your own comments." }, headers, 403);
            }

            const cardChanged =
              JSON.stringify(oldEntry.card) !== JSON.stringify(newEntry.card) ||
              oldEntry.colId !== newEntry.colId ||
              oldEntry.index !== newEntry.index;

            if (cardChanged && oldOwner !== currentUser) {
              const contentChanged =
                stableStringify(comparableCardContent(oldEntry.card)) !==
                stableStringify(comparableCardContent(newEntry.card));
              const columnChanged = oldEntry.colId !== newEntry.colId;
              const indexChanged = oldEntry.index !== newEntry.index;
              const passiveReindexOnly =
                !contentChanged &&
                !commentsChanged &&
                !columnChanged &&
                indexChanged;
              const moveOnly =
                !contentChanged &&
                !commentsChanged &&
                columnChanged &&
                oldAssignee === currentUser;
              const commentsOnly =
                !contentChanged &&
                !columnChanged &&
                !indexChanged &&
                commentsChanged &&
                commentsChangeAllowed(oldEntry.card.comments, newEntry.card.comments, currentUser);
              const moveWithAllowedComments =
                !contentChanged &&
                columnChanged &&
                commentsChanged &&
                oldAssignee === currentUser &&
                commentsChangeAllowed(oldEntry.card.comments, newEntry.card.comments, currentUser);

              if (!moveOnly && !passiveReindexOnly && !commentsOnly && !moveWithAllowedComments) {
                return jsonResponse({ error: "You can edit or delete only your own cards." }, headers, 403);
              }
            }

            if ((newEntry.card.createdBy || "").trim() !== oldOwner) {
              return jsonResponse({ error: "Card author cannot be changed." }, headers, 403);
            }
          }

          for (const [cardId, newEntry] of newCards.entries()) {
            if (oldCards.has(cardId)) continue;
            if ((newEntry.card.createdBy || "").trim() !== currentUser) {
              return jsonResponse({ error: "New cards must belong to the current user." }, headers, 403);
            }
            const newComments = normalizeComments(newEntry.card.comments);
            if (newComments.some((comment) => (comment.author || "").trim() !== currentUser)) {
              return jsonResponse({ error: "You can add only your own comments." }, headers, 403);
            }
          }
        }

        const nextState = sanitizedState(body, currentUsers);
        await persistBoardState(env, boardId, nextState);
        return jsonResponse({ success: true }, headers);
      }

      if (path === "/upload" && method === "POST") {
        if (!env.BUCKET) return new Response("R2 Bucket not configured", { status: 500, headers });
        const currentUser = await getSessionUser(env, boardId, getUserToken(request, url));
        if (!currentUser) return jsonResponse({ error: "Unauthorized" }, headers, 401);

        const contentType = request.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) {
          return new Response("Only images are allowed", { status: 400, headers });
        }

        const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
        if (contentLength > 1 * 1024 * 1024) {
          return new Response("Image too large (max 1MB)", { status: 413, headers });
        }

        const extension = contentType.split("/")[1] || "png";
        const filename = `${boardId}/${crypto.randomUUID()}.${extension}`;
        const blob = await request.blob();

        await env.BUCKET.put(filename, blob, {
          httpMetadata: { contentType },
        });

        const fileUrl = `${url.origin}/image?key=${encodeURIComponent(filename)}&boardId=${encodeURIComponent(boardId)}`;
        return jsonResponse({ url: fileUrl, key: filename }, headers);
      }

      if (path === "/image" && method === "GET") {
        const key = url.searchParams.get("key");
        if (!key) return new Response("Missing key", { status: 400, headers });

        const object = await env.BUCKET.get(key);
        if (!object) return new Response("Not Found", { status: 404, headers });

        const imageHeaders = new Headers(headers);
        object.writeHttpMetadata(imageHeaders);
        imageHeaders.set("etag", object.httpEtag);
        imageHeaders.set("Cache-Control", "public, max-age=31536000");
        return new Response(object.body, { headers: imageHeaders });
      }

      if (path === "/delete-image" && method === "DELETE") {
        const key = url.searchParams.get("key");
        if (!key) return new Response("Missing key", { status: 400, headers });
        const currentUser = await getSessionUser(env, boardId, getUserToken(request, url));
        if (!currentUser) return jsonResponse({ error: "Unauthorized" }, headers, 401);
        if (!key.startsWith(`${boardId}/`)) {
          return new Response("Unauthorized", { status: 401, headers });
        }

        await env.BUCKET.delete(key);
        return jsonResponse({ success: true }, headers);
      }

      return new Response("Not Found", { status: 404, headers });
    } catch (err) {
      return jsonResponse({ error: err.message }, headers, 500);
    }
  },
};
