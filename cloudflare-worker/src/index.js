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
      byId.set(card.id, { card, colId: col.id, colTitle: col.title || "", isDone: !!col.isDone, isArchive: !!col.isArchive, index });
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

function stripHtml(value = "") {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function truncateText(value = "", max = 120) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function userLabel(user = {}) {
  return (user.name || user.email || "").trim();
}

function cardLabel(card = {}) {
  return truncateText(card.title || "Untitled card", 90);
}

function commentsChangeAllowed(oldComments = [], newComments = [], currentUser = {}, options = {}) {
  const oldList = flattenComments(oldComments);
  const newList = flattenComments(newComments);
  const oldById = new Map(oldList.map((comment) => [comment.id, comment]));
  const newById = new Map(newList.map((comment) => [comment.id, comment]));
  const canDeleteAny = !!options.canDeleteAny;

  for (const oldComment of oldList) {
    const next = newById.get(oldComment.id);
    if (!next) {
      if (!canDeleteAny && !currentUserMatchesIdentity({ email: oldComment.authorEmail, name: oldComment.author }, currentUser)) return false;
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
  return normalizeBoardId(request.headers.get("X-Board-ID")) || normalizeBoardId(url.searchParams.get("boardId")) || "default";
}

function getUserToken(request, url) {
  return request.headers.get("X-User-Token") || url.searchParams.get("token") || "";
}

function normalizeBoardId(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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

async function getTableInfo(env, tableName) {
  const result = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all();
  return result.results || [];
}

async function ensureColumn(env, tableName, columnName, definition) {
  const columns = await getTableColumns(env, tableName);
  if (!columns.has(columnName)) {
    await env.DB.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
  }
}

function hasPrimaryKey(tableInfo, columnNames) {
  const pkColumns = tableInfo
    .filter((column) => Number(column.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk))
    .map((column) => column.name);
  return stableStringify(pkColumns) === stableStringify(columnNames);
}

async function migrateBoardUsersTable(env) {
  const tableInfo = await getTableInfo(env, "board_users");
  if (hasPrimaryKey(tableInfo, ["board_id", "email"])) return;

  await env.DB.prepare("ALTER TABLE board_users RENAME TO board_users_legacy").run();
  await env.DB.prepare(
    "CREATE TABLE board_users (board_id TEXT NOT NULL, email TEXT NOT NULL, name TEXT DEFAULT '', avatar_url TEXT DEFAULT '', avatar_key TEXT DEFAULT '', is_admin INTEGER DEFAULT 0, is_approved INTEGER DEFAULT 1, updated_at TEXT, PRIMARY KEY (board_id, email))"
  ).run();
  await env.DB.prepare(
    `INSERT OR REPLACE INTO board_users (board_id, email, name, avatar_url, avatar_key, is_admin, is_approved, updated_at)
     SELECT
       COALESCE(NULLIF(board_id, ''), 'default'),
       LOWER(TRIM(COALESCE(NULLIF(email, ''), NULLIF(name, '')))),
       COALESCE(name, ''),
       COALESCE(avatar_url, ''),
       COALESCE(avatar_key, ''),
       COALESCE(is_admin, 0),
       COALESCE(is_approved, 1),
       updated_at
     FROM board_users_legacy
     WHERE TRIM(COALESCE(NULLIF(email, ''), NULLIF(name, ''))) <> ''`
  ).run();
  await env.DB.prepare("DROP TABLE board_users_legacy").run();
}

async function migrateBoardUserCredentialsTable(env) {
  const tableInfo = await getTableInfo(env, "board_user_credentials");
  if (hasPrimaryKey(tableInfo, ["board_id", "email"])) return;

  await env.DB.prepare("ALTER TABLE board_user_credentials RENAME TO board_user_credentials_legacy").run();
  await env.DB.prepare(
    "CREATE TABLE board_user_credentials (board_id TEXT NOT NULL, email TEXT NOT NULL, pin_hash TEXT NOT NULL, pin_salt TEXT NOT NULL, updated_at TEXT, PRIMARY KEY (board_id, email))"
  ).run();
  await env.DB.prepare(
    `INSERT OR REPLACE INTO board_user_credentials (board_id, email, pin_hash, pin_salt, updated_at)
     SELECT
       COALESCE(NULLIF(board_id, ''), 'default'),
       LOWER(TRIM(COALESCE(NULLIF(email, ''), NULLIF(name, '')))),
       pin_hash,
       pin_salt,
       updated_at
     FROM board_user_credentials_legacy
     WHERE TRIM(COALESCE(NULLIF(email, ''), NULLIF(name, ''))) <> ''
       AND COALESCE(pin_hash, '') <> ''
       AND COALESCE(pin_salt, '') <> ''`
  ).run();
  await env.DB.prepare("DROP TABLE board_user_credentials_legacy").run();
}

async function migrateBoardSessionsTable(env) {
  const tableInfo = await getTableInfo(env, "board_sessions");
  const columns = new Set(tableInfo.map((column) => column.name));
  if (!columns.has("user_name")) return;

  await env.DB.prepare("ALTER TABLE board_sessions RENAME TO board_sessions_legacy").run();
  await env.DB.prepare(
    "CREATE TABLE board_sessions (token TEXT PRIMARY KEY, board_id TEXT NOT NULL, user_email TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)"
  ).run();
  await env.DB.prepare(
    `INSERT OR REPLACE INTO board_sessions (token, board_id, user_email, created_at, expires_at)
     SELECT
       token,
       COALESCE(NULLIF(board_id, ''), 'default'),
       LOWER(TRIM(COALESCE(NULLIF(user_email, ''), NULLIF(user_name, '')))),
       created_at,
       expires_at
     FROM board_sessions_legacy
     WHERE COALESCE(token, '') <> ''
       AND TRIM(COALESCE(NULLIF(user_email, ''), NULLIF(user_name, ''))) <> ''`
  ).run();
  await env.DB.prepare("DROP TABLE board_sessions_legacy").run();
}

let schemaReady = null;

async function ensureSchema(env) {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS boards (id TEXT PRIMARY KEY, name TEXT DEFAULT '', created_by TEXT DEFAULT '', data TEXT, created_at TEXT, updated_at TEXT)").run();
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS board_users (board_id TEXT NOT NULL, email TEXT NOT NULL, name TEXT DEFAULT '', avatar_url TEXT DEFAULT '', avatar_key TEXT DEFAULT '', is_admin INTEGER DEFAULT 0, is_approved INTEGER DEFAULT 1, updated_at TEXT, PRIMARY KEY (board_id, email))"
    ).run();
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS board_user_credentials (board_id TEXT NOT NULL, email TEXT NOT NULL, pin_hash TEXT NOT NULL, pin_salt TEXT NOT NULL, updated_at TEXT, PRIMARY KEY (board_id, email))"
    ).run();
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS board_sessions (token TEXT PRIMARY KEY, board_id TEXT NOT NULL, user_email TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)"
    ).run();
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS board_notifications (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, recipient_email TEXT NOT NULL, actor_email TEXT DEFAULT '', type TEXT NOT NULL, card_id TEXT DEFAULT '', comment_id TEXT DEFAULT '', title TEXT DEFAULT '', body TEXT DEFAULT '', metadata_json TEXT DEFAULT '{}', created_at TEXT NOT NULL, read_at TEXT DEFAULT '')"
    ).run();
    await ensureColumn(env, "boards", "updated_at", "TEXT");
    await ensureColumn(env, "boards", "name", "TEXT DEFAULT ''");
    await ensureColumn(env, "boards", "created_by", "TEXT DEFAULT ''");
    await ensureColumn(env, "boards", "created_at", "TEXT");
    await ensureColumn(env, "board_users", "board_id", "TEXT DEFAULT 'default'");
    await ensureColumn(env, "board_users", "email", "TEXT DEFAULT ''");
    await ensureColumn(env, "board_users", "name", "TEXT DEFAULT ''");
    await ensureColumn(env, "board_users", "avatar_url", "TEXT DEFAULT ''");
    await ensureColumn(env, "board_users", "avatar_key", "TEXT DEFAULT ''");
    await ensureColumn(env, "board_users", "is_admin", "INTEGER DEFAULT 0");
    await ensureColumn(env, "board_users", "is_approved", "INTEGER DEFAULT 1");
    await ensureColumn(env, "board_users", "updated_at", "TEXT");
    await ensureColumn(env, "board_user_credentials", "board_id", "TEXT DEFAULT 'default'");
    await ensureColumn(env, "board_user_credentials", "email", "TEXT DEFAULT ''");
    await ensureColumn(env, "board_user_credentials", "pin_hash", "TEXT DEFAULT ''");
    await ensureColumn(env, "board_user_credentials", "pin_salt", "TEXT DEFAULT ''");
    await ensureColumn(env, "board_user_credentials", "updated_at", "TEXT");
    await migrateBoardUsersTable(env);
    await migrateBoardUserCredentialsTable(env);
    await ensureColumn(env, "board_sessions", "board_id", "TEXT DEFAULT 'default'");
    await ensureColumn(env, "board_sessions", "user_email", "TEXT DEFAULT ''");
    await ensureColumn(env, "board_sessions", "created_at", "TEXT");
    await ensureColumn(env, "board_sessions", "expires_at", "TEXT");
    await ensureColumn(env, "board_notifications", "board_id", "TEXT DEFAULT 'default'");
    await ensureColumn(env, "board_notifications", "recipient_email", "TEXT DEFAULT ''");
    await ensureColumn(env, "board_notifications", "actor_email", "TEXT DEFAULT ''");
    await ensureColumn(env, "board_notifications", "type", "TEXT DEFAULT ''");
    await ensureColumn(env, "board_notifications", "card_id", "TEXT DEFAULT ''");
    await ensureColumn(env, "board_notifications", "comment_id", "TEXT DEFAULT ''");
    await ensureColumn(env, "board_notifications", "title", "TEXT DEFAULT ''");
    await ensureColumn(env, "board_notifications", "body", "TEXT DEFAULT ''");
    await ensureColumn(env, "board_notifications", "metadata_json", "TEXT DEFAULT '{}'");
    await ensureColumn(env, "board_notifications", "created_at", "TEXT");
    await ensureColumn(env, "board_notifications", "read_at", "TEXT DEFAULT ''");
    await migrateBoardSessionsTable(env);
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_board_users_board_id ON board_users(board_id)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_board_user_credentials_board_id ON board_user_credentials(board_id)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_board_sessions_board_id ON board_sessions(board_id)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_board_notifications_recipient ON board_notifications(board_id, recipient_email, created_at)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_board_notifications_unread ON board_notifications(board_id, recipient_email, read_at)").run();
  })();
  return schemaReady;
}

async function readBoardRow(env, boardId) {
  return env.DB.prepare("SELECT id, name, data FROM boards WHERE id = ?").bind(boardId).first();
}

async function ensureBoardRecord(env, boardId, { name = "", createdBy = "" } = {}) {
  const id = normalizeBoardId(boardId) || "default";
  const now = new Date().toISOString();
  const existing = await env.DB.prepare("SELECT id, name FROM boards WHERE id = ?").bind(id).first();
  if (existing) {
    if (name && !existing.name) {
      await env.DB.prepare("UPDATE boards SET name = ?, updated_at = COALESCE(updated_at, ?) WHERE id = ?").bind(name, now, id).run();
    }
    return { id, name: existing.name || name || id };
  }
  await env.DB.prepare(
    "INSERT INTO boards (id, name, created_by, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, name || id, normalizeEmail(createdBy || ""), JSON.stringify(boardStatePayload({ columns: [] })), now, now).run();
  return { id, name: name || id };
}

async function listAccessibleBoards(env, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];
  const result = await env.DB.prepare(
    `SELECT
       u.board_id AS id,
       COALESCE(NULLIF(b.name, ''), u.board_id) AS name,
       u.is_admin AS isAdmin,
       u.is_approved AS isApproved
     FROM board_users u
     LEFT JOIN boards b ON b.id = u.board_id
     WHERE u.email = ? AND u.is_approved = 1
     ORDER BY COALESCE(NULLIF(b.name, ''), u.board_id) COLLATE NOCASE`
  ).bind(normalizedEmail).all();
  return (result.results || []).map((row) => ({
    id: row.id || "default",
    name: row.name || row.id || "default",
    isAdmin: !!row.isAdmin,
    isApproved: row.isApproved === undefined ? true : !!row.isApproved,
  }));
}

async function listUserBoardIds(env, email) {
  const result = await env.DB.prepare(
    "SELECT board_id AS boardId FROM board_users WHERE email = ? AND is_approved = 1 ORDER BY board_id COLLATE NOCASE"
  ).bind(normalizeEmail(email)).all();
  return (result.results || []).map((row) => row.boardId).filter(Boolean);
}

async function adminUsersPayload(env, boardId, adminEmail) {
  const users = await listPublicUsers(env, boardId, { includePending: true });
  const adminBoards = (await listAccessibleBoards(env, adminEmail)).filter((board) => board.isAdmin);
  const usersWithBoards = [];
  for (const user of users) {
    usersWithBoards.push({
      ...user,
      boards: await listUserBoardIds(env, user.email),
    });
  }
  return { users: usersWithBoards, boards: adminBoards };
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

async function listCredentialsForEmail(env, email) {
  const result = await env.DB.prepare(
    "SELECT board_id AS boardId, email, pin_hash AS pinHash, pin_salt AS pinSalt FROM board_user_credentials WHERE email = ?"
  ).bind(normalizeEmail(email)).all();
  return result.results || [];
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
  await env.DB.prepare("DELETE FROM board_notifications WHERE board_id = ? AND recipient_email = ?").bind(boardId, normalizedEmail).run();
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
    `INSERT INTO boards (id, data, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  ).bind(boardId, data, new Date().toISOString()).run();
}

async function insertNotification(env, notification = {}, { dedupe = false } = {}) {
  const recipientEmail = normalizeEmail(notification.recipientEmail || "");
  const type = String(notification.type || "").trim();
  const boardId = normalizeBoardId(notification.boardId || "") || "default";
  if (!recipientEmail || !type) return false;

  const actorEmail = normalizeEmail(notification.actorEmail || "");
  if (actorEmail && actorEmail === recipientEmail) return false;

  const metadata = notification.metadata && typeof notification.metadata === "object" ? notification.metadata : {};
  const metadataJson = stableStringify(metadata);
  const cardId = notification.cardId || "";
  const commentId = notification.commentId || "";

  if (dedupe) {
    const existing = await env.DB.prepare(
      `SELECT id FROM board_notifications
       WHERE board_id = ? AND recipient_email = ? AND type = ? AND card_id = ? AND comment_id = ? AND metadata_json = ?
       LIMIT 1`
    ).bind(boardId, recipientEmail, type, cardId, commentId, metadataJson).first();
    if (existing) return false;
  }

  await env.DB.prepare(
    `INSERT INTO board_notifications
       (id, board_id, recipient_email, actor_email, type, card_id, comment_id, title, body, metadata_json, created_at, read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')`
  ).bind(
    crypto.randomUUID(),
    boardId,
    recipientEmail,
    actorEmail,
    type,
    cardId,
    commentId,
    truncateText(notification.title || "", 180),
    truncateText(notification.body || "", 280),
    metadataJson,
    notification.createdAt || new Date().toISOString()
  ).run();
  return true;
}

function normalizeNotificationRow(row = {}) {
  let metadata = {};
  try {
    metadata = row.metadataJson ? JSON.parse(row.metadataJson) : {};
  } catch {}
  return {
    id: row.id || "",
    boardId: row.boardId || "",
    recipientEmail: normalizeEmail(row.recipientEmail || ""),
    actorEmail: normalizeEmail(row.actorEmail || ""),
    type: row.type || "",
    cardId: row.cardId || "",
    commentId: row.commentId || "",
    title: row.title || "",
    body: row.body || "",
    metadata,
    createdAt: row.createdAt || "",
    readAt: row.readAt || "",
  };
}

async function listNotifications(env, boardId, recipientEmail, limit = 50) {
  const normalizedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const rows = await env.DB.prepare(
    `SELECT
       id,
       board_id AS boardId,
       recipient_email AS recipientEmail,
       actor_email AS actorEmail,
       type,
       card_id AS cardId,
       comment_id AS commentId,
       title,
       body,
       metadata_json AS metadataJson,
       created_at AS createdAt,
       read_at AS readAt
     FROM board_notifications
     WHERE board_id = ? AND recipient_email = ?
     ORDER BY created_at DESC
     LIMIT ?`
  ).bind(boardId, normalizeEmail(recipientEmail), normalizedLimit).all();
  const unreadRow = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM board_notifications WHERE board_id = ? AND recipient_email = ? AND COALESCE(read_at, '') = ''"
  ).bind(boardId, normalizeEmail(recipientEmail)).first();
  return {
    notifications: (rows.results || []).map(normalizeNotificationRow),
    unreadCount: Number(unreadRow?.count || 0),
  };
}

async function markNotificationsRead(env, boardId, recipientEmail, body = {}) {
  const now = new Date().toISOString();
  const normalizedEmail = normalizeEmail(recipientEmail);
  if (body.all) {
    await env.DB.prepare(
      "UPDATE board_notifications SET read_at = ? WHERE board_id = ? AND recipient_email = ? AND COALESCE(read_at, '') = ''"
    ).bind(now, boardId, normalizedEmail).run();
    return;
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : (body.id ? [body.id] : []);
  for (const id of ids) {
    await env.DB.prepare(
      "UPDATE board_notifications SET read_at = COALESCE(NULLIF(read_at, ''), ?) WHERE board_id = ? AND recipient_email = ? AND id = ?"
    ).bind(now, boardId, normalizedEmail, id).run();
  }
}

function recipientSet(...items) {
  const set = new Set();
  items.forEach((item) => {
    const email = normalizeEmail(item?.email || "");
    if (email) set.add(email);
  });
  return set;
}

async function generateDueNotificationsForUser(env, boardId, user) {
  const currentUser = normalizePublicUserRecord(user);
  if (!currentUser.email || !currentUser.isApproved) return;
  const state = await loadSanitizedBoard(env, boardId);
  const now = Date.now();
  const soonMs = 48 * 60 * 60 * 1000;
  for (const entry of flattenCards(state).values()) {
    const { card } = entry;
    if (entry.isDone || entry.isArchive || !card?.due) continue;
    if (!currentUserMatchesIdentity(normalizeAssignedUser(card.assignedUser) || {}, currentUser)) continue;
    const dueTime = Date.parse(card.due);
    if (!Number.isFinite(dueTime)) continue;
    const type = dueTime < now ? "card_overdue" : (dueTime - now <= soonMs ? "due_soon" : "");
    if (!type) continue;
    const due = new Date(dueTime).toISOString();
    await insertNotification(env, {
      boardId,
      recipientEmail: currentUser.email,
      actorEmail: "",
      type,
      cardId: card.id || "",
      title: type === "card_overdue" ? "Card is overdue" : "Card is due soon",
      body: cardLabel(card),
      metadata: {
        cardTitle: cardLabel(card),
        due,
        columnTitle: entry.colTitle || "",
        notificationKey: `${type}:${card.id || ""}:${due}`,
      },
    }, { dedupe: true });
  }
}

async function generateBoardChangeNotifications(env, boardId, existingState, nextState, actor, approvedUsers = []) {
  const actorEmail = normalizeEmail(actor?.email || "");
  const actorName = userLabel(actor);
  const approvedEmails = new Set((approvedUsers || []).filter((u) => u?.isApproved !== false).map((u) => normalizeEmail(u.email || "")).filter(Boolean));
  const isApprovedRecipient = (email) => approvedEmails.has(normalizeEmail(email));
  const oldCards = flattenCards(existingState);
  const newCards = flattenCards(nextState);

  const notify = async (recipientEmail, type, entry, extra = {}) => {
    const email = normalizeEmail(recipientEmail || "");
    if (!email || !isApprovedRecipient(email) || email === actorEmail) return;
    const card = entry?.card || {};
    await insertNotification(env, {
      boardId,
      recipientEmail: email,
      actorEmail,
      type,
      cardId: card.id || extra.cardId || "",
      commentId: extra.commentId || "",
      title: extra.title || "",
      body: extra.body || cardLabel(card),
      metadata: {
        actorName,
        actorEmail,
        cardTitle: cardLabel(card),
        columnTitle: entry?.colTitle || "",
        fromColumnTitle: extra.fromColumnTitle || "",
        toColumnTitle: extra.toColumnTitle || entry?.colTitle || "",
        commentText: extra.commentText || "",
        due: card.due || "",
        ...(extra.metadata || {}),
      },
    }, extra.dedupe ? { dedupe: true } : {});
  };

  for (const [cardId, newEntry] of newCards.entries()) {
    const oldEntry = oldCards.get(cardId);
    const newAssignee = normalizeAssignedUser(newEntry.card.assignedUser);
    const oldAssignee = normalizeAssignedUser(oldEntry?.card?.assignedUser);
    const newAssigneeEmail = normalizeEmail(newAssignee?.email || "");
    const oldAssigneeEmail = normalizeEmail(oldAssignee?.email || "");

    if (newAssigneeEmail && newAssigneeEmail !== oldAssigneeEmail) {
      await notify(newAssigneeEmail, "card_assigned", newEntry, {
        title: "Card assigned to you",
        body: cardLabel(newEntry.card),
      });
    }
    if (oldAssigneeEmail && oldAssigneeEmail !== newAssigneeEmail) {
      await notify(oldAssigneeEmail, "card_unassigned", newEntry, {
        title: "Card unassigned from you",
        body: cardLabel(newEntry.card),
      });
    }

    if (oldEntry && oldEntry.colId !== newEntry.colId) {
      if (newAssigneeEmail) {
        await notify(newAssigneeEmail, "card_moved", newEntry, {
          title: "Assigned card moved",
          fromColumnTitle: oldEntry.colTitle || "",
          toColumnTitle: newEntry.colTitle || "",
        });
      }
      if (newEntry.isDone && !oldEntry.isDone) {
        for (const recipientEmail of recipientSet({ email: newEntry.card.createdByEmail }, newAssignee)) {
          await notify(recipientEmail, "card_completed", newEntry, {
            title: "Card completed",
            fromColumnTitle: oldEntry.colTitle || "",
            toColumnTitle: newEntry.colTitle || "",
          });
        }
      }
    }

    const oldComments = oldEntry ? flattenComments(oldEntry.card.comments || []) : [];
    const newComments = flattenComments(newEntry.card.comments || []);
    const oldCommentIds = new Set(oldComments.map((comment) => comment.id));
    const oldCommentsById = new Map(oldComments.map((comment) => [comment.id, comment]));
    for (const comment of newComments) {
      if (!comment.id || oldCommentIds.has(comment.id)) continue;
      const commentAuthorEmail = normalizeEmail(comment.authorEmail || "");
      if (commentAuthorEmail && commentAuthorEmail !== actorEmail) continue;
      const commentText = truncateText(comment.text || "", 140);
      const repliedTo = new Set();
      if (comment.parentId) {
        const parent = oldCommentsById.get(comment.parentId) || newComments.find((item) => item.id === comment.parentId);
        await notify(parent?.authorEmail, "reply_to_comment", newEntry, {
          title: "New reply",
          commentId: comment.id,
          commentText,
          body: commentText || cardLabel(newEntry.card),
        });
        if (parent?.authorEmail) repliedTo.add(normalizeEmail(parent.authorEmail));
      }
      for (const recipientEmail of recipientSet({ email: newEntry.card.createdByEmail }, newAssignee)) {
        if (repliedTo.has(normalizeEmail(recipientEmail))) continue;
        await notify(recipientEmail, "comment_on_owned_or_assigned_card", newEntry, {
          title: "New comment",
          commentId: comment.id,
          commentText,
          body: commentText || cardLabel(newEntry.card),
        });
      }
    }
  }
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
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Board-ID, X-User-Token",
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const boardId = getBoardId(request, url);

    try {
      await ensureSchema(env);

      if (path === "/boards" && method === "GET") {
        const currentUserEmail = await getSessionUser(env, boardId, getUserToken(request, url));
        if (!currentUserEmail) {
          return jsonResponse({ error: "Unauthorized" }, headers, 401);
        }
        return jsonResponse({
          boards: await listAccessibleBoards(env, currentUserEmail),
        }, headers);
      }

      if (path === "/boards" && method === "POST") {
        const currentUserEmail = await getSessionUser(env, boardId, getUserToken(request, url));
        if (!currentUserEmail || !(await isUserAdmin(env, boardId, currentUserEmail))) {
          return jsonResponse({ error: "Only admin can create boards." }, headers, 403);
        }

        const body = await parseJson(request);
        const requestedName = (body.name || body.boardId || "").trim();
        if (!requestedName) {
          return jsonResponse({ error: "Board name is required." }, headers, 400);
        }
        let nextBoardId = normalizeBoardId(body.boardId || requestedName);
        if (!nextBoardId) {
          nextBoardId = "board-" + crypto.randomUUID().slice(0, 8);
        }

        const existingBoard = await readBoardRow(env, nextBoardId);
        const existingUsers = await listPublicUsers(env, nextBoardId, { includePending: true });
        if (existingBoard || existingUsers.length > 0) {
          return jsonResponse({ error: "A board with this name already exists." }, headers, 409);
        }

        await ensureBoardRecord(env, nextBoardId, { name: requestedName || nextBoardId, createdBy: currentUserEmail });
        const currentUser = await getPublicUser(env, boardId, currentUserEmail);
        const currentCredential = await getUserCredential(env, boardId, currentUserEmail);
        await upsertUserRecord(env, nextBoardId, {
          ...(currentUser || { email: currentUserEmail }),
          email: currentUserEmail,
          isAdmin: true,
          isApproved: true,
        });
        if (currentCredential?.pinHash && currentCredential?.pinSalt) {
          await env.DB.prepare(
            "INSERT OR REPLACE INTO board_user_credentials (board_id, email, pin_hash, pin_salt, updated_at) VALUES (?, ?, ?, ?, ?)"
          ).bind(nextBoardId, currentUserEmail, currentCredential.pinHash, currentCredential.pinSalt, new Date().toISOString()).run();
        }
        const session = await createSession(env, nextBoardId, currentUserEmail);
        const targetUser = await getPublicUser(env, nextBoardId, currentUserEmail);
        return jsonResponse({
          success: true,
          board: { id: nextBoardId, name: requestedName || nextBoardId, isAdmin: true, isApproved: true },
          boards: await listAccessibleBoards(env, currentUserEmail),
          user: targetUser,
          token: session.token,
          expiresAt: session.expiresAt,
          isAdmin: true,
        }, headers);
      }

      if (path === "/boards" && method === "PUT") {
        const currentUserEmail = await getSessionUser(env, boardId, getUserToken(request, url));
        if (!currentUserEmail || !(await isUserAdmin(env, boardId, currentUserEmail))) {
          return jsonResponse({ error: "Only admin can rename boards." }, headers, 403);
        }

        const body = await parseJson(request);
        const targetBoardId = normalizeBoardId(body.boardId || "");
        const newName = (body.name || "").trim();
        if (!targetBoardId) {
          return jsonResponse({ error: "Board ID is required." }, headers, 400);
        }
        if (!newName) {
          return jsonResponse({ error: "Board name is required." }, headers, 400);
        }

        const board = await readBoardRow(env, targetBoardId);
        if (!board) {
          return jsonResponse({ error: "Board not found." }, headers, 404);
        }

        const isTargetAdmin = await isUserAdmin(env, targetBoardId, currentUserEmail);
        if (!isTargetAdmin) {
          return jsonResponse({ error: "Only admin of the target board can rename it." }, headers, 403);
        }

        await env.DB.prepare("UPDATE boards SET name = ?, updated_at = ? WHERE id = ?")
          .bind(newName, new Date().toISOString(), targetBoardId).run();

        return jsonResponse({
          success: true,
          board: { id: targetBoardId, name: newName },
          boards: await listAccessibleBoards(env, currentUserEmail),
        }, headers);
      }

      if (path === "/boards" && method === "DELETE") {
        const currentUserEmail = await getSessionUser(env, boardId, getUserToken(request, url));
        if (!currentUserEmail || !(await isUserAdmin(env, boardId, currentUserEmail))) {
          return jsonResponse({ error: "Only admin can delete boards." }, headers, 403);
        }

        const body = await parseJson(request);
        const targetBoardId = normalizeBoardId(body.boardId || "");
        if (!targetBoardId) {
          return jsonResponse({ error: "Board ID is required." }, headers, 400);
        }
        if (targetBoardId === "default") {
          return jsonResponse({ error: "The default board cannot be deleted." }, headers, 403);
        }

        const board = await readBoardRow(env, targetBoardId);
        if (!board) {
          return jsonResponse({ error: "Board not found." }, headers, 404);
        }

        const isTargetAdmin = await isUserAdmin(env, targetBoardId, currentUserEmail);
        if (!isTargetAdmin) {
          return jsonResponse({ error: "Only admin of the target board can delete it." }, headers, 403);
        }

        if (env.BUCKET) {
          try {
            const prefix = `${targetBoardId}/`;
            const objects = await env.BUCKET.list({ prefix });
            for (const obj of objects.objects) {
              await env.BUCKET.delete(obj.key);
            }
          } catch {}
        }

        await env.DB.prepare("DELETE FROM board_sessions WHERE board_id = ?").bind(targetBoardId).run();
        await env.DB.prepare("DELETE FROM board_user_credentials WHERE board_id = ?").bind(targetBoardId).run();
        await env.DB.prepare("DELETE FROM board_notifications WHERE board_id = ?").bind(targetBoardId).run();
        await env.DB.prepare("DELETE FROM board_users WHERE board_id = ?").bind(targetBoardId).run();
        await env.DB.prepare("DELETE FROM boards WHERE id = ?").bind(targetBoardId).run();

        return jsonResponse({
          success: true,
          boards: await listAccessibleBoards(env, currentUserEmail),
        }, headers);
      }

      if (path === "/boards-for-login" && method === "POST") {
        const body = await parseJson(request);
        const email = normalizeEmail(body.email || "");
        const pinCode = (body.pinCode || "").trim();
        if (!email || !pinCode) {
          return jsonResponse({ error: "Email and password are required." }, headers, 400);
        }

        const credentials = await listCredentialsForEmail(env, email);
        const matchedBoards = [];
        for (const credential of credentials) {
          if (!(await verifyPin(pinCode, credential.pinSalt, credential.pinHash))) continue;
          const publicUser = await getPublicUser(env, credential.boardId, email);
          if (publicUser?.isApproved) {
            matchedBoards.push(credential.boardId);
          }
        }
        if (!matchedBoards.length) {
          return jsonResponse({ error: "Invalid email or password." }, headers, 403);
        }
        const boards = await listAccessibleBoards(env, email);
        return jsonResponse({
          boards: boards.filter((board) => matchedBoards.includes(board.id)),
        }, headers);
      }

      if (path === "/board-session" && method === "POST") {
        const currentUserEmail = await getSessionUser(env, boardId, getUserToken(request, url));
        if (!currentUserEmail) {
          return jsonResponse({ error: "Unauthorized" }, headers, 401);
        }

        const body = await parseJson(request);
        const targetBoardId = String(body.boardId || "").trim();
        if (!targetBoardId) {
          return jsonResponse({ error: "Board is required." }, headers, 400);
        }
        const targetUser = await getPublicUser(env, targetBoardId, currentUserEmail);
        if (!targetUser || !targetUser.isApproved) {
          return jsonResponse({ error: "You do not have access to this board." }, headers, 403);
        }
        const session = await createSession(env, targetBoardId, currentUserEmail);
        return jsonResponse({
          success: true,
          user: targetUser,
          token: session.token,
          expiresAt: session.expiresAt,
          isAdmin: !!targetUser.isAdmin,
        }, headers);
      }

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

      if (path === "/notifications" && method === "GET") {
        const currentUserEmail = await getSessionUser(env, boardId, getUserToken(request, url));
        if (!currentUserEmail) {
          return jsonResponse({ error: "Unauthorized" }, headers, 401);
        }
        const currentUser = await getPublicUser(env, boardId, currentUserEmail);
        if (!currentUser || !currentUser.isApproved) {
          return jsonResponse({ error: "Unauthorized" }, headers, 401);
        }
        await generateDueNotificationsForUser(env, boardId, currentUser);
        return jsonResponse(await listNotifications(env, boardId, currentUser.email, url.searchParams.get("limit") || 50), headers);
      }

      if (path === "/notifications/read" && method === "POST") {
        const currentUserEmail = await getSessionUser(env, boardId, getUserToken(request, url));
        if (!currentUserEmail) {
          return jsonResponse({ error: "Unauthorized" }, headers, 401);
        }
        const currentUser = await getPublicUser(env, boardId, currentUserEmail);
        if (!currentUser || !currentUser.isApproved) {
          return jsonResponse({ error: "Unauthorized" }, headers, 401);
        }
        const body = await parseJson(request);
        await markNotificationsRead(env, boardId, currentUserEmail, body);
        return jsonResponse({ success: true, ...(await listNotifications(env, boardId, currentUserEmail, body.limit || 50)) }, headers);
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
        const nextName = (body.name || "").trim();
        const nextAvatarUrl = body.avatarUrl !== undefined ? body.avatarUrl : currentUser.avatarUrl;
        const nextAvatarKey = body.avatarKey !== undefined ? body.avatarKey : currentUser.avatarKey;
        await upsertUserRecord(env, boardId, {
          email: currentUser.email,
          name: nextName,
          avatarUrl: nextAvatarUrl,
          avatarKey: nextAvatarKey,
          isAdmin: !!currentUser.isAdmin,
          isApproved: !!currentUser.isApproved,
        }, pinCode || null);
        
        const allBoardIds = await listUserBoardIds(env, currentUser.email);
        for (const otherBoardId of allBoardIds) {
          if (otherBoardId === boardId) continue;
          const otherUser = await getPublicUser(env, otherBoardId, currentUser.email);
          if (!otherUser) continue;
          await env.DB.prepare(
            "UPDATE board_users SET name = ?, avatar_url = ?, avatar_key = ?, updated_at = ? WHERE board_id = ? AND email = ?"
          ).bind(nextName, nextAvatarUrl, nextAvatarKey, new Date().toISOString(), otherBoardId, currentUser.email).run();
        }
        
        if (pinCode) {
          await env.DB.prepare("DELETE FROM board_sessions WHERE board_id = ? AND user_email = ?").bind(boardId, currentUser.email).run();
        }
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
        return jsonResponse(await adminUsersPayload(env, boardId, currentUserEmail), headers);
      }

      if (path === "/user-board-access" && method === "POST") {
        const currentUserEmail = await getSessionUser(env, boardId, getUserToken(request, url));
        if (!currentUserEmail || !(await isUserAdmin(env, boardId, currentUserEmail))) {
          return jsonResponse({ error: "Only admin can modify board access." }, headers, 403);
        }

        const body = await parseJson(request);
        const email = normalizeEmail(body.email || "");
        const targetBoardId = String(body.boardId || "").trim();
        const hasAccess = !!body.hasAccess;
        if (!email || !targetBoardId) {
          return jsonResponse({ error: "User and board are required." }, headers, 400);
        }
        if (targetBoardId === boardId) {
          return jsonResponse({ error: "Current board access is managed by approval/removal." }, headers, 400);
        }
        if (!(await isUserAdmin(env, targetBoardId, currentUserEmail))) {
          return jsonResponse({ error: "You can assign only boards where you are admin." }, headers, 403);
        }

        const sourceUser = await getPublicUser(env, boardId, email);
        if (!sourceUser) {
          return jsonResponse({ error: "User is not on the current board." }, headers, 404);
        }

        if (hasAccess) {
          const existingTargetUser = await getPublicUser(env, targetBoardId, email);
          await upsertUserRecord(env, targetBoardId, {
            ...sourceUser,
            isAdmin: !!existingTargetUser?.isAdmin,
            isApproved: true,
          });
          const existingCredential = await getUserCredential(env, targetBoardId, email);
          const sourceCredential = await getUserCredential(env, boardId, email);
          if (!existingCredential && sourceCredential?.pinHash && sourceCredential?.pinSalt) {
            await env.DB.prepare(
              "INSERT OR REPLACE INTO board_user_credentials (board_id, email, pin_hash, pin_salt, updated_at) VALUES (?, ?, ?, ?, ?)"
            ).bind(targetBoardId, email, sourceCredential.pinHash, sourceCredential.pinSalt, new Date().toISOString()).run();
          }
          if (!existingTargetUser?.isApproved) {
            const board = await readBoardRow(env, targetBoardId);
            await insertNotification(env, {
              boardId: targetBoardId,
              recipientEmail: email,
              actorEmail: currentUserEmail,
              type: "board_access_granted",
              title: "Board access granted",
              body: board?.name || targetBoardId,
              metadata: {
                actorEmail: currentUserEmail,
                boardName: board?.name || targetBoardId,
                boardId: targetBoardId,
              },
            }, { dedupe: true });
          }
        } else {
          if (await isUserAdmin(env, targetBoardId, email)) {
            return jsonResponse({ error: "Admin user cannot be removed from that board." }, headers, 403);
          }
          await deleteUserRecords(env, targetBoardId, email);
        }

        return jsonResponse(await adminUsersPayload(env, boardId, currentUserEmail), headers);
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
        const wasApproved = !!existingUser?.isApproved;

        await upsertUserRecord(env, boardId, {
          email: nextEmail,
          name: (body.name || "").trim(),
          avatarUrl: body.avatarUrl || existingUser?.avatarUrl || "",
          avatarKey: body.avatarKey || existingUser?.avatarKey || "",
          isAdmin: body.isAdmin !== undefined ? !!body.isAdmin : !!existingUser?.isAdmin,
          isApproved: body.isApproved !== undefined ? !!body.isApproved : !!existingUser?.isApproved,
        }, pinCode || null);

        if (pinCode) {
          await env.DB.prepare("DELETE FROM board_sessions WHERE board_id = ? AND user_email = ?").bind(boardId, nextEmail).run();
        }

        if (!wasApproved && body.isApproved === true) {
          await insertNotification(env, {
            boardId,
            recipientEmail: nextEmail,
            actorEmail: currentUserEmail,
            type: "user_approved",
            title: "Account approved",
            body: "You can now access this board.",
            metadata: {
              actorEmail: currentUserEmail,
              boardId,
            },
          }, { dedupe: true });
        }

        return jsonResponse({ success: true, ...(await adminUsersPayload(env, boardId, currentUserEmail)) }, headers);
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
        return jsonResponse({ success: true, ...(await adminUsersPayload(env, boardId, currentUserEmail)) }, headers);
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

        const oldCards = flattenCards(existingState);
        const newCards = flattenCards(body);

        for (const [cardId, oldEntry] of oldCards.entries()) {
          const newEntry = newCards.get(cardId);
          if (!newEntry) continue;

          const commentsChanged =
            stableStringify(normalizeComments(oldEntry.card.comments)) !==
            stableStringify(normalizeComments(newEntry.card.comments));

          if (commentsChanged && !commentsChangeAllowed(oldEntry.card.comments, newEntry.card.comments, currentUser, { canDeleteAny: isAdmin })) {
            return jsonResponse({ error: "You can edit or delete only your own comments." }, headers, 403);
          }
        }

        for (const [cardId, newEntry] of newCards.entries()) {
          if (oldCards.has(cardId)) continue;
          const newComments = flattenComments(newEntry.card.comments);
          if (newComments.some((comment) => !currentUserMatchesIdentity({ email: comment.authorEmail, name: comment.author }, currentUser))) {
            return jsonResponse({ error: "You can add only your own comments." }, headers, 403);
          }
        }

        if (!isAdmin) {
          if (normalizeColumnShells(existingState.columns) !== normalizeColumnShells(body.columns)) {
            return jsonResponse({ error: "Only admin can modify board structure." }, headers, 403);
          }

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
          }
        }

        await persistBoardState(env, boardId, body);
        try {
          await generateBoardChangeNotifications(env, boardId, existingState, body, currentUser, currentUsers);
        } catch (notificationError) {
          console.warn("Failed to generate notifications:", notificationError);
        }
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

        const slashIdx = key.indexOf("/");
        const imageBoardId = slashIdx > 0 ? key.slice(0, slashIdx) : boardId;
        const isCrossBoard = imageBoardId !== boardId;

        if (!isCrossBoard && !key.startsWith(`${boardId}/`)) {
          return new Response("Unauthorized", { status: 401, headers });
        }

        const token = getUserToken(request, url);
        if (!token) return new Response("Unauthorized", { status: 401, headers });

        let authorized = false;
        if (isCrossBoard) {
          const currentUserEmail = await getSessionUser(env, boardId, token);
          if (currentUserEmail) {
            const imageBoardUser = await getPublicUser(env, imageBoardId, currentUserEmail);
            if (imageBoardUser?.isApproved) authorized = true;
          }
        } else {
          const publicUsers = await listPublicUsers(env, boardId);
          if (publicUsers.length > 0) {
            const currentUserEmail = await getSessionUser(env, boardId, token);
            if (currentUserEmail) authorized = true;
          } else {
            authorized = true;
          }
        }

        if (!authorized) return new Response("Unauthorized", { status: 401, headers });

        const object = await env.BUCKET.get(key);
        if (!object) return new Response("Not Found", { status: 404, headers });

        const imageHeaders = new Headers(headers);
        object.writeHttpMetadata(imageHeaders);
        imageHeaders.set("etag", object.httpEtag);
        imageHeaders.set("Cache-Control", "private, max-age=31536000");
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
        
        const isAdminUser = await isUserAdmin(env, boardId, currentUser);
        if (!isAdminUser) {
           return jsonResponse({ error: "Only admins can perform remote deletion" }, headers, 403);
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
