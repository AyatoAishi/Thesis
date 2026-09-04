// ============================================================================
// lib/loginGuard.js — how many wrong passwords this door will take.
//
// Both sign-in pages, staff and portal, go through here. It answers one
// question before the password is even checked ("is this username or this
// address currently locked out?") and records what happened after.
//
// Two axes, because they catch different attacks:
//
//   per username — somebody working through a password list against one known
//                  account. Locks that account's door only, so the attacker
//                  cannot lock out the whole clinic by guessing at every
//                  username in turn.
//
//   per address  — somebody spraying one common password across many
//                  usernames, which never trips a per-username counter.
//
// Failures are counted only since that username's last SUCCESSFUL sign-in. A
// nurse who mistypes four times and then gets in starts clean, instead of
// carrying three-quarters of a lockout into tomorrow morning.
//
// The lockout is a delay, not a ban: it expires on its own as the window
// slides forward. Nobody at this clinic can unlock an account at 6am, so a
// lock that needs an admin to clear it would be a lock on the clinic.
// ============================================================================
const db = require("../db");

const WINDOW_MINUTES = 15;
const MAX_PER_USERNAME = 5;
// Higher, because one address is a whole barangay behind one router, and the
// clinic's own staff share the desk's connection. This is the ceiling for
// password spraying, not for ordinary fumbling.
const MAX_PER_IP = 25;

// Express sees the proxy's address unless trust proxy is set; both are read so
// this keeps working either way. Truncated to fit the column — an address
// longer than 45 characters is not one we can act on anyway.
function addressOf(req) {
  const fwd = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return (fwd || req.ip || req.connection?.remoteAddress || "").slice(0, 45) || null;
}

// Is this attempt allowed to proceed? Called BEFORE the password is checked,
// so a locked-out account costs no bcrypt work — that is half the point of
// having a limit at all.
//
// Returns { blocked, retryAfterMinutes, reason }.
async function check({ kind, username, ip }) {
  const { rows } = await db.query(
    `WITH last_ok AS (
       SELECT max(created_at) AS at
         FROM login_attempts
        WHERE kind = $1 AND lower(username) = lower($2) AND ok
     )
     SELECT
       (SELECT count(*)::int FROM login_attempts a, last_ok
         WHERE a.kind = $1
           AND lower(a.username) = lower($2)
           AND NOT a.ok
           AND a.created_at > now() - ($3 || ' minutes')::interval
           AND (last_ok.at IS NULL OR a.created_at > last_ok.at)) AS user_fails,
       (SELECT min(created_at) FROM login_attempts a, last_ok
         WHERE a.kind = $1
           AND lower(a.username) = lower($2)
           AND NOT a.ok
           AND a.created_at > now() - ($3 || ' minutes')::interval
           AND (last_ok.at IS NULL OR a.created_at > last_ok.at)) AS user_first,
       (SELECT count(*)::int FROM login_attempts
         WHERE ip = $4 AND NOT ok
           AND created_at > now() - ($3 || ' minutes')::interval) AS ip_fails`,
    [kind, username || "", String(WINDOW_MINUTES), ip]
  );

  const r = rows[0];
  const minutesLeft = (from) => {
    if (!from) return WINDOW_MINUTES;
    const elapsed = (Date.now() - new Date(from).getTime()) / 60000;
    return Math.max(1, Math.ceil(WINDOW_MINUTES - elapsed));
  };

  if (r.user_fails >= MAX_PER_USERNAME) {
    return { blocked: true, retryAfterMinutes: minutesLeft(r.user_first), reason: "username" };
  }
  if (ip && r.ip_fails >= MAX_PER_IP) {
    return { blocked: true, retryAfterMinutes: WINDOW_MINUTES, reason: "address" };
  }
  return { blocked: false, retryAfterMinutes: 0, reason: null, userFails: r.user_fails };
}

// Write down what happened. Never throws: a sign-in must not fail because the
// log did, the same rule lib/audit.js follows.
async function record({ kind, username, ip, ok, reason }) {
  try {
    await db.query(
      `INSERT INTO login_attempts (kind, username, ip, ok, reason)
       VALUES ($1,$2,$3,$4,$5)`,
      [kind, (username || "").slice(0, 80), ip, !!ok, reason ? String(reason).slice(0, 40) : null]
    );
  } catch (e) {
    console.error("[loginGuard]", e.message);
  }
}

// The sentence the person actually reads. Deliberately does not say whether
// the username exists — a lockout message that only appears for real accounts
// is a way of enumerating them.
function lockoutMessage(minutes) {
  return `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

function lockoutMessageTagalog(minutes) {
  return `Masyadong maraming maling subok. Subukan ulit pagkalipas ng ${minutes} minuto.`;
}

module.exports = {
  check, record, addressOf, lockoutMessage, lockoutMessageTagalog,
  WINDOW_MINUTES, MAX_PER_USERNAME, MAX_PER_IP,
};
