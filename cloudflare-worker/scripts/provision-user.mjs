import { webcrypto } from "node:crypto";

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function hashPin(pinCode, saltBase64) {
  const combined = `${saltBase64}:${pinCode}`;
  const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(combined));
  return `sha256:${bytesToBase64(new Uint8Array(digest))}`;
}

function sqlEscape(value) {
  return String(value || "").replace(/'/g, "''");
}

const [boardId, name, pinCode, avatarUrl = "", avatarKey = "", isAdminArg = "0"] = process.argv.slice(2);

if (!boardId || !name || !pinCode) {
  console.error("Usage: node cloudflare-worker/scripts/provision-user.mjs <boardId> <name> <pinCode> [avatarUrl] [avatarKey] [isAdmin:0|1]");
  process.exit(1);
}

const saltBytes = webcrypto.getRandomValues(new Uint8Array(16));
const pinSalt = bytesToBase64(saltBytes);
const pinHash = await hashPin(pinCode, pinSalt);
const now = new Date().toISOString();
const isAdmin = isAdminArg === "1" ? 1 : 0;

console.log(`INSERT OR REPLACE INTO board_users (board_id, name, avatar_url, avatar_key, is_admin, updated_at) VALUES ('${sqlEscape(boardId)}', '${sqlEscape(name)}', '${sqlEscape(avatarUrl)}', '${sqlEscape(avatarKey)}', ${isAdmin}, '${sqlEscape(now)}');`);
console.log(`INSERT OR REPLACE INTO board_user_credentials (board_id, name, pin_hash, pin_salt, updated_at) VALUES ('${sqlEscape(boardId)}', '${sqlEscape(name)}', '${sqlEscape(pinHash)}', '${sqlEscape(pinSalt)}', '${sqlEscape(now)}');`);
