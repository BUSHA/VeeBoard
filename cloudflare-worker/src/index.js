const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const LEGACY_PBKDF2_ITERATIONS = 20000;

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

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
    assignedUser: normalizeAssignedUser(card.assignedUser),
    attachments: card.attachments || [],
    createdBy: card.createdBy || "",
    createdByEmail: normalizeEmail(card.createdByEmail || ""),
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
    authorEmail: normalizeEmail(comment.authorEmail || ""),
    createdAt: comment.createdAt || "",
    updatedAt: comment.updatedAt || comment.createdAt || "",
    replies: normalizeComments(comment.replies || []),
  }));
}

function flattenComments(comments = [], parentId = "") {
  const normalized = normalizeComments(comments);
  const items = [];
  for (const comment of normalized) {
    items.push({
      id: comment.id || "",
      text: comment.text || "",
      author: comment.author || "",
      authorEmail: normalizeEmail(comment.authorEmail || ""),
      createdAt: comment.createdAt || "",
      updatedAt: comment.updatedAt || comment.createdAt || "",
      parentId: parentId || "",
    });
    items.push(...flattenComments(comment.replies || [], comment.id || ""));
  }
  return items;
}

function normalizePublicUserRecord(user = {}) {
  return {
    email: normalizeEmail(user.email || ""),
    name: (user.name || "").trim(),
    avatarUrl: user.avatarUrl || "",
    avatarKey: user.avatarKey || "",
    isAdmin: !!user.isAdmin,
    isApproved: user.isApproved === undefined ? true : !!user.isApproved,
  };
}

function normalizeAssignedUser(user = null) {
  if (!user || typeof user !== "object") return null;
  const email = normalizeEmail(user.email || "");
  const name = (user.name || "").trim();
  if (!email && !name) return null;
  return { email, name };
}

function currentUserMatchesIdentity(identity = {}, currentUser = {}) {
  const currentEmail = normalizeEmail(currentUser.email || "");
  const currentName = (currentUser.name || "").trim();
  const identityEmail = normalizeEmail(identity.email || "");
  const identityName = (identity.name || "").trim();
  if (currentEmail && identityEmail) return currentEmail === identityEmail;
  return !!currentName && currentName === identityName;
}

function commentsChangeAllowed(oldComments = [], newComments = [], currentUser = {}) {
  const oldList = flattenComments(oldComments);
  const newList = flattenComments(newComments);
  const oldById = new Map(oldList.map((comment) => [comment.id, comment]));
  const newById = new Map(newList.map((comment) => [comment.id, comment]));

  for (const oldComment of oldList) {
    const next = newById.get(oldComment.id);
    if (!next) {
      if (!currentUserMatchesIdentity({ email: oldComment.authorEmail, name: oldComment.author }, currentUser)) return false;
      continue;
    }
    if ((next.author || "").trim() !== (oldComment.author || "").trim()) return false;
    if (normalizeEmail(next.authorEmail || "") !== normalizeEmail(oldComment.authorEmail || "")) return false;
    if ((next.createdAt || "") !== (oldComment.createdAt || "")) return false;
    if ((next.parentId || "") !== (oldComment.parentId || "")) return false;
    const oldComparable = {
      text: oldComment.text || "",
      author: oldComment.author || "",
      authorEmail: normalizeEmail(oldComment.authorEmail || ""),
      createdAt: oldComment.createdAt || "",
      updatedAt: oldComment.updatedAt || oldComment.createdAt || "",
    };
    const nextComparable = {
      text: next.text || "",
      author: next.author || "",
      authorEmail: normalizeEmail(next.authorEmail || ""),
      createdAt: next.createdAt || "",
      updatedAt: next.updatedAt || next.createdAt || "",
    };
    if (stableStringify(oldComparable) !== stableStringify(nextComparable) && !currentUserMatchesIdentity({ email: oldComment.authorEmail, name: oldComment.author }, currentUser)) {
      return false;
    }
  }

  for (const newComment of newList) {
    if (oldById.has(newComment.id)) continue;
    if (!currentUserMatchesIdentity({ email: newComment.authorEmail, name: newComment.author }, currentUser)) return false;
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
  const pinHash = await hashPinLegacyPbkdf2(pinCode, saltBase64);
  return { pinHash, pinSalt: saltBase64 };
}

async function getTableColumns(env, tableName) {
  const result = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all();
  return new Set((result.results || []).map((row) => row.name));
}

let schemaReady = null;

async function ensureSchema(env) {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS boards (id TEXT PRIMARY KEY, data TEXT, updated_at TEXT)").run();
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS board_users (board_id TEXT NOT NULL, email TEXT NOT NULL, name TEXT DEFAULT '', avatar_url TEXT DEFAULT '', avatar_key TEXT DEFAULT '', is_admin INTEGER DEFAULT 0, is_approved INTEGER DEFAULT 1, updated_at TEXT, PRIMARY KEY (board_id, email))"
    ).run();
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS board_user_credentials (board_id TEXT NOT NULL, email TEXT NOT NULL, pin_hash TEXT NOT NULL, pin_salt TEXT NOT NULL, updated_at TEXT, PRIMARY KEY (board_id, email))"
    ).run();
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS board_sessions (token TEXT PRIMARY KEY, board_id TEXT NOT NULL, user_email TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)"
    ).run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_board_users_board_id ON board_users(board_id)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_board_user_credentials_board_id ON board_user_credentials(board_id)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_board_sessions_board_id ON board_sessions(board_id)").run();
  })();
  return schemaReady;
}

async function readBoardRow(env, boardId) {
  return env.DB.prepare("SELECT data FROM boards WHERE id = ?").bind(boardId).first();
}

async function listPublicUsers(env, boardId, { includePending = false } = {}) {
  const result = await env.DB.prepare(
    `SELECT email, name, avatar_url AS avatarUrl, avatar_key AS avatarKey, is_admin AS isAdmin, is_approved AS isApproved
     FROM board_users
     WHERE board_id = ? ${includePending ? "" : "AND is_approved = 1"}
     ORDER BY COALESCE(NULLIF(name, ''), email) COLLATE NOCASE`
  ).bind(boardId).all();
  return (result.results || []).map(normalizePublicUserRecord);
}

async function getPublicUser(env, boardId, email) {
  const row = await env.DB.prepare(
    "SELECT email, name, avatar_url AS avatarUrl, avatar_key AS avatarKey, is_admin AS isAdmin, is_approved AS isApproved FROM board_users WHERE board_id = ? AND email = ?"
  ).bind(boardId, normalizeEmail(email)).first();
  return row ? normalizePublicUserRecord(row) : null;
}

async function getUserCredential(env, boardId, email) {
  return env.DB.prepare(
    "SELECT email, pin_hash AS pinHash, pin_salt AS pinSalt FROM board_user_credentials WHERE board_id = ? AND email = ?"
  ).bind(boardId, normalizeEmail(email)).first();
}

async function upsertUserRecord(env, boardId, user, pinCode = null) {
  const normalized = normalizePublicUserRecord(user);
  if (!normalized.email) throw new Error("User email is required");
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT OR REPLACE INTO board_users (board_id, email, name, avatar_url, avatar_key, is_admin, is_approved, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    boardId,
    normalized.email,
    normalized.name,
    normalized.avatarUrl,
    normalized.avatarKey,
    normalized.isAdmin ? 1 : 0,
    normalized.isApproved ? 1 : 0,
    now
  ).run();

  if (typeof pinCode === "string" && pinCode.trim()) {
    const { pinHash, pinSalt } = await makeCredential(pinCode.trim());
    await env.DB.prepare(
      "INSERT OR REPLACE INTO board_user_credentials (board_id, email, pin_hash, pin_salt, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(boardId, normalized.email, pinHash, pinSalt, now).run();
  }
}

async function deleteUserRecords(env, boardId, email) {
  const normalizedEmail = normalizeEmail(email);
  await env.DB.prepare("DELETE FROM board_users WHERE board_id = ? AND email = ?").bind(boardId, normalizedEmail).run();
  await env.DB.prepare("DELETE FROM board_user_credentials WHERE board_id = ? AND email = ?").bind(boardId, normalizedEmail).run();
  await env.DB.prepare("DELETE FROM board_sessions WHERE board_id = ? AND user_email = ?").bind(boardId, normalizedEmail).run();
}

async function createSession(env, boardId, userEmail) {
  const token = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  const normalizedEmail = normalizeEmail(userEmail);
  const createdAt = new Date(now).toISOString();
  await env.DB.prepare(
    "INSERT OR REPLACE INTO board_sessions (token, board_id, user_email, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(token, boardId, normalizedEmail, createdAt, expiresAt).run();
  return { token, expiresAt };
}

async function getSessionUser(env, boardId, token) {
  if (!token) return "";
  const row = await env.DB.prepare(
    "SELECT user_email AS userEmail, expires_at AS expiresAt FROM board_sessions WHERE token = ? AND board_id = ?"
  ).bind(token, boardId).first();
  if (!row) return "";
  if (row.expiresAt && Date.parse(row.expiresAt) <= Date.now()) {
    await env.DB.prepare("DELETE FROM board_sessions WHERE token = ?").bind(token).run();
    return "";
  }
  return normalizeEmail(row.userEmail || "");
}

async function isUserAdmin(env, boardId, email) {
  const user = await getPublicUser(env, boardId, email);
  return !!user?.isAdmin;
}

function sanitizedState(state = {}, publicUsers = []) {
  return {
    ...state,
    users: publicUsers.map(normalizePublicUserRecord),
  };
}

function boardStatePayload(state = {}) {
  return {
    columns: Array.isArray(state.columns) ? state.columns : [],
  };
}

async function loadSanitizedBoard(env, boardId) {
  const row = await readBoardRow(env, boardId);
  const publicUsers = await listPublicUsers(env, boardId);
  const rawState = row?.data ? JSON.parse(row.data) : null;
  if (!rawState) {
    return sanitizedState(boardStatePayload({ columns: [] }), publicUsers);
  }
  return sanitizedState(rawState, publicUsers);
}

async function persistBoardState(env, boardId, state) {
  const data = JSON.stringify(boardStatePayload(state));
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
      await ensureSchema(env);

      if (path === "/load" && method === "GET") {
        const publicUsers = await listPublicUsers(env, boardId);
        if (publicUsers.length > 0) {
          const currentUserEmail = await getSessionUser(env, boardId, getUserToken(request, url));
          if (!currentUserEmail) {
            return jsonResponse({ error: "Unauthorized" }, headers, 401);
          }
        }
        const state = await loadSanitizedBoard(env, boardId);
        return jsonResponse(state, headers);
      }

      if (path === "/auth" && method === "POST") {
        const body = await parseJson(request);
        const email = normalizeEmail(body.email || "");
        const pinCode = (body.pinCode || "").trim();
        if (!email || !pinCode) {
          return jsonResponse({ error: "Email and password are required." }, headers, 400);
        }

        const publicUser = await getPublicUser(env, boardId, email);
        const credential = await getUserCredential(env, boardId, email);
        if (credential) {
          const isValid = await verifyPin(pinCode, credential.pinSalt, credential.pinHash);
          if (!isValid) {
            return jsonResponse({ error: "Invalid email or password." }, headers, 403);
          }
        } else if (publicUser) {
          return jsonResponse({ error: "Invalid email or password." }, headers, 403);
        } else {
          return jsonResponse({ error: "Invalid email or password." }, headers, 403);
        }

        if (!publicUser) {
          return jsonResponse({ error: "Invalid email or password." }, headers, 403);
        }
        if (!publicUser.isApproved) {
          return jsonResponse({ error: "Your account is waiting for admin approval." }, headers, 403);
        }
        const session = await createSession(env, boardId, email);
        return jsonResponse({
          success: true,
          user: publicUser,
          token: session.token,
          expiresAt: session.expiresAt,
          isAdmin: !!publicUser.isAdmin,
        }, headers);
      }

      if (path === "/signup" && method === "POST") {
        const body = await parseJson(request);
        const email = normalizeEmail(body.email || "");
        const pinCode = (body.pinCode || "").trim();
        const name = (body.name || "").trim();
        if (!email || !pinCode) {
          return jsonResponse({ error: "Email and password are required." }, headers, 400);
        }
        const existingUser = await getPublicUser(env, boardId, email);
        const existingCredential = await getUserCredential(env, boardId, email);
        if (existingUser || existingCredential) {
          return jsonResponse({ error: "An account with this email already exists." }, headers, 409);
        }
        const allUsers = await listPublicUsers(env, boardId, { includePending: true });
        const isFirstUser = allUsers.length === 0;
        await upsertUserRecord(env, boardId, {
          email,
          name,
          isAdmin: isFirstUser,
          isApproved: isFirstUser,
        }, pinCode);
        return jsonResponse({
          success: true,
          pendingApproval: !isFirstUser,
          bootstrapOwner: isFirstUser,
        }, headers);
      }

      if (path === "/profile" && method === "POST") {
        const currentUserEmail = await getSessionUser(env, boardId, getUserToken(request, url));
        if (!currentUserEmail) {
          return jsonResponse({ error: "Unauthorized" }, headers, 401);
        }

        const body = await parseJson(request);
        const currentUser = await getPublicUser(env, boardId, currentUserEmail);
        if (!currentUser) {
          return jsonResponse({ error: "Unauthorized" }, headers, 401);
        }
        const pinCode = typeof body.pinCode === "string" ? body.pinCode.trim() : "";
        await upsertUserRecord(env, boardId, {
          email: currentUser.email,
          name: (body.name || "").trim(),
          avatarUrl: body.avatarUrl !== undefined ? body.avatarUrl : currentUser.avatarUrl,
          avatarKey: body.avatarKey !== undefined ? body.avatarKey : currentUser.avatarKey,
          isAdmin: !!currentUser.isAdmin,
          isApproved: !!currentUser.isApproved,
        }, pinCode || null);
        return jsonResponse({
          success: true,
          user: await getPublicUser(env, boardId, currentUser.email),
          users: await listPublicUsers(env, boardId),
        }, headers);
      }

      if (path === "/users" && method === "GET") {
        const currentUserEmail = await getSessionUser(env, boardId, getUserToken(request, url));
        if (!currentUserEmail || !(await isUserAdmin(env, boardId, currentUserEmail))) {
          return jsonResponse({ error: "Only admin can view all users." }, headers, 403);
        }
        return jsonResponse({ users: await listPublicUsers(env, boardId, { includePending: true }) }, headers);
      }

      if (path === "/user" && method === "POST") {
        const currentUserEmail = await getSessionUser(env, boardId, getUserToken(request, url));
        if (!currentUserEmail || !(await isUserAdmin(env, boardId, currentUserEmail))) {
          return jsonResponse({ error: "Only admin can modify users." }, headers, 403);
        }

        const body = await parseJson(request);
        const previousEmail = normalizeEmail(body.previousEmail || "");
        const nextEmail = normalizeEmail(body.email || "");
        const pinCode = typeof body.pinCode === "string" ? body.pinCode.trim() : "";
        if (!nextEmail) {
          return jsonResponse({ error: "User email is required." }, headers, 400);
        }
        if (previousEmail && previousEmail !== nextEmail) {
          return jsonResponse({ error: "Changing account email is not supported." }, headers, 400);
        }

        const existingUser = await getPublicUser(env, boardId, nextEmail);
        if (!existingUser && !pinCode) {
          return jsonResponse({ error: "Password is required for a new user." }, headers, 400);
        }

        await upsertUserRecord(env, boardId, {
          email: nextEmail,
          name: (body.name || "").trim(),
          avatarUrl: body.avatarUrl || existingUser?.avatarUrl || "",
          avatarKey: body.avatarKey || existingUser?.avatarKey || "",
          isAdmin: body.isAdmin !== undefined ? !!body.isAdmin : !!existingUser?.isAdmin,
          isApproved: body.isApproved !== undefined ? !!body.isApproved : !!existingUser?.isApproved,
        }, pinCode || null);

        return jsonResponse({ success: true, users: await listPublicUsers(env, boardId, { includePending: true }) }, headers);
      }

      if (path === "/user" && method === "DELETE") {
        const currentUserEmail = await getSessionUser(env, boardId, getUserToken(request, url));
        if (!currentUserEmail || !(await isUserAdmin(env, boardId, currentUserEmail))) {
          return jsonResponse({ error: "Only admin can delete users." }, headers, 403);
        }
        const email = normalizeEmail(url.searchParams.get("email") || "");
        if (!email) {
          return jsonResponse({ error: "Missing user email." }, headers, 400);
        }
        if (await isUserAdmin(env, boardId, email)) {
          return jsonResponse({ error: "Admin user cannot be deleted." }, headers, 403);
        }
        await deleteUserRecords(env, boardId, email);
        return jsonResponse({ success: true, users: await listPublicUsers(env, boardId, { includePending: true }) }, headers);
      }

      if (path === "/save" && method === "POST") {
        const currentUserEmail = await getSessionUser(env, boardId, getUserToken(request, url));
        if (!currentUserEmail) {
          return jsonResponse({ error: "Unauthorized" }, headers, 401);
        }
        const currentUser = await getPublicUser(env, boardId, currentUserEmail);
        if (!currentUser) {
          return jsonResponse({ error: "Unauthorized" }, headers, 401);
        }

        const body = await parseJson(request);
        const existingRow = await readBoardRow(env, boardId);
        const existingRawState = existingRow?.data ? JSON.parse(existingRow.data) : null;
        const currentUsers = await listPublicUsers(env, boardId);
        const existingState = existingRawState
          ? sanitizedState(existingRawState, currentUsers)
          : { columns: [], users: [] };
        const sentUsers = Array.isArray(body.users) ? body.users.map(normalizePublicUserRecord) : [];
        const sentUsersStable = stableStringify(sentUsers);
        const currentUsersStable = stableStringify(currentUsers);
        const isAdmin = !!currentUser.isAdmin;

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
            const oldOwner = {
              email: normalizeEmail(oldEntry.card.createdByEmail || ""),
              name: (oldEntry.card.createdBy || "").trim(),
            };
            const oldAssignee = normalizeAssignedUser(oldEntry.card.assignedUser);

            if (!newEntry) {
              if (!currentUserMatchesIdentity(oldOwner, currentUser)) {
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

            if (cardChanged && !currentUserMatchesIdentity(oldOwner, currentUser)) {
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
                currentUserMatchesIdentity(oldAssignee || {}, currentUser);
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
                currentUserMatchesIdentity(oldAssignee || {}, currentUser) &&
                commentsChangeAllowed(oldEntry.card.comments, newEntry.card.comments, currentUser);

              if (!moveOnly && !passiveReindexOnly && !commentsOnly && !moveWithAllowedComments) {
                return jsonResponse({ error: "You can edit or delete only your own cards." }, headers, 403);
              }
            }

            if (
              normalizeEmail(newEntry.card.createdByEmail || "") !== normalizeEmail(oldEntry.card.createdByEmail || "") ||
              (newEntry.card.createdBy || "").trim() !== (oldEntry.card.createdBy || "").trim()
            ) {
              return jsonResponse({ error: "Card author cannot be changed." }, headers, 403);
            }
          }

          for (const [cardId, newEntry] of newCards.entries()) {
            if (oldCards.has(cardId)) continue;
            if (!currentUserMatchesIdentity({ email: newEntry.card.createdByEmail, name: newEntry.card.createdBy }, currentUser)) {
              return jsonResponse({ error: "New cards must belong to the current user." }, headers, 403);
            }
            const newComments = flattenComments(newEntry.card.comments);
            if (newComments.some((comment) => !currentUserMatchesIdentity({ email: comment.authorEmail, name: comment.author }, currentUser))) {
              return jsonResponse({ error: "You can add only your own comments." }, headers, 403);
            }
          }
        }

        await persistBoardState(env, boardId, body);
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
        if (contentLength > 5 * 1024 * 1024) {
          return new Response("Image too large (max 5MB)", { status: 413, headers });
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

        const publicUsers = await listPublicUsers(env, boardId);
        if (publicUsers.length > 0) {
          const currentUserEmail = await getSessionUser(env, boardId, getUserToken(request, url));
          if (!currentUserEmail) {
            return new Response("Unauthorized", { status: 401, headers });
          }
        }

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
