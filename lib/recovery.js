// ============================================================================
// lib/recovery.js — the hard-coded recovery super admin (panel review, Oct
// 2026: "Gumawa ng Super Admin account (hard coded)", with "encrypted
// credentials"; and "what if the system goes down, flooded by corrupted data —
// the super admin should still be accessible").
//
// Its username and password are NOT in the database. They are two secret
// settings on the server:
//
//   RECOVERY_USERNAME        e.g. "recovery" — must not be any staff username
//   RECOVERY_PASSWORD_HASH   a bcrypt hash, never the password itself
//                            (make one with: npm run recovery:hash)
//
// So it signs in even when the main database is down or full of garbage —
// through the SAME staff sign-in page, no separate door — and lands on the
// recovery page and nowhere else (routes/recovery.js).
//
// Failed attempts are counted in memory, not in the database's sign-in
// counter: the whole point is that this works when the database does not.
// ============================================================================
const bcrypt = require("bcryptjs");

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const fails = [];

const username = () => String(process.env.RECOVERY_USERNAME || "").trim();
const hash = () => String(process.env.RECOVERY_PASSWORD_HASH || "").trim();

function configured() {
  return !!username() && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash());
}

// Exact match, like every staff username.
const isRecoveryName = (name) => configured() && name === username();

function prune() {
  const cutoff = Date.now() - WINDOW_MS;
  while (fails.length && fails[0] < cutoff) fails.shift();
}

// Minutes to wait, or 0.
function blockedMinutes() {
  prune();
  if (fails.length < MAX_FAILS) return 0;
  return Math.max(1, Math.ceil((fails[0] + WINDOW_MS - Date.now()) / 60000));
}

const recordFail = () => fails.push(Date.now());
const clearFails = () => { fails.length = 0; };

async function check(password) {
  if (!configured()) return false;
  return bcrypt.compare(String(password || ""), hash());
}

// What goes in the session. No user_id: this account is not a database row,
// and nothing that needs one is reachable from it.
function sessionUser() {
  return {
    user_id: null,
    username: username(),
    full_name: "Recovery super admin",
    role: "recovery",
    recovery: true,
    preferences: {},
  };
}

module.exports = { configured, isRecoveryName, blockedMinutes, recordFail, clearFails, check, sessionUser };
