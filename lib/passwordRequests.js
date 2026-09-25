// ============================================================================
// lib/passwordRequests.js — staff password changes that wait for the admin.
//
// The rule, in one place: a staff account's password changes only when an
// admin says so. Two ways a request starts (see the migration for the table):
//
//   requestChange()  from /account — the person proved their current password
//                    and proposed a new one; only its bcrypt hash is kept.
//   requestForgot()  from /forgot — no password at all; the admin will issue a
//                    temporary one on approval.
//
// The admin is the one exception. There is nobody above the admin to approve,
// so an admin changes their own password directly, as before. With a single
// admin account that is the only coherent answer; the moment there are two,
// this is the line to revisit.
//
// Every state change is a conditional UPDATE ... WHERE status = 'pending'. Two
// admins pressing Approve at once, or an approve racing a cancel, cannot both
// win: the second one finds nothing pending and gets told so.
// ============================================================================
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../db");

const FORGOT_PER_IP = 5;          // forgot-password requests per address …
const FORGOT_WINDOW_MINUTES = 30;  // … per this many minutes

// Readable temporary passwords: no 0/O, 1/l/I, so a password read aloud at the
// desk or copied off a sticky note is not guessed at. Ten characters from a
// 54-symbol alphabet is ~57 bits — far more than a one-time handover needs.
const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function temporaryPassword(length = 10) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += TEMP_ALPHABET[bytes[i] % TEMP_ALPHABET.length];
  return out;
}

async function pendingFor(userId) {
  const { rows } = await db.query(
    `SELECT request_id, kind, requested_at FROM password_requests
      WHERE user_id = $1 AND status = 'pending'`,
    [userId]
  );
  return rows[0] || null;
}

// Replaces any request already pending for the same account. Somebody who asks
// twice has changed their mind about the password, not asked for two of them.
async function replacePending(userId) {
  await db.query(
    `UPDATE password_requests
        SET status = 'cancelled', decided_at = now(), decision_note = 'replaced by a newer request'
      WHERE user_id = $1 AND status = 'pending'`,
    [userId]
  );
}

async function requestChange(userId, newPassword, ip) {
  const hash = await bcrypt.hash(newPassword, 10);
  await replacePending(userId);
  const { rows } = await db.query(
    `INSERT INTO password_requests (user_id, kind, new_password_hash, requested_ip)
     VALUES ($1, 'change', $2, $3) RETURNING request_id`,
    [userId, hash, ip]
  );
  return rows[0].request_id;
}

// Returns true when a request was filed. The CALLER must not reveal that —
// /forgot answers identically whether the username exists or not.
async function requestForgot(username, ip) {
  if (ip) {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM password_requests
        WHERE kind = 'forgot' AND requested_ip = $1
          AND requested_at > now() - ($2 || ' minutes')::interval`,
      [ip, String(FORGOT_WINDOW_MINUTES)]
    );
    if (rows[0].n >= FORGOT_PER_IP) return { filed: false, throttled: true };
  }

  // Case-sensitive, matching how staff sign in (routes/auth.js).
  const { rows: users } = await db.query(
    "SELECT user_id, role, status FROM users WHERE username = $1",
    [String(username || "").trim()]
  );
  const u = users[0];
  // No account, a deactivated one, or the admin (who resets their own) — all
  // quietly file nothing. Deactivated staff are the admin's to reinstate, and a
  // reset request would be a side door around that decision.
  if (!u || u.status !== "active" || u.role === "admin") return { filed: false, throttled: false };

  // A 'forgot' already pending is left as it is: asking again at the sign-in
  // page adds nothing the admin does not already know.
  if (await pendingFor(u.user_id)) return { filed: false, throttled: false };

  await db.query(
    `INSERT INTO password_requests (user_id, kind, requested_ip) VALUES ($1, 'forgot', $2)`,
    [u.user_id, ip]
  );
  return { filed: true, throttled: false, userId: u.user_id };
}

async function cancelOwn(userId) {
  const { rowCount } = await db.query(
    `UPDATE password_requests
        SET status = 'cancelled', decided_at = now(), decided_by = $1, decision_note = 'cancelled by the requester'
      WHERE user_id = $1 AND status = 'pending'`,
    [userId]
  );
  return rowCount > 0;
}

async function listPending() {
  const { rows } = await db.query(
    `SELECT r.request_id, r.kind, r.requested_at, r.requested_ip,
            u.user_id, u.full_name, u.username, u.role
       FROM password_requests r
       JOIN users u ON u.user_id = r.user_id
      WHERE r.status = 'pending'
      ORDER BY r.requested_at`
  );
  return rows;
}

async function countPending() {
  const { rows } = await db.query(
    "SELECT count(*)::int AS n FROM password_requests WHERE status = 'pending'"
  );
  return rows[0].n;
}

// Approve. For a 'change' the proposed hash becomes the password; for a
// 'forgot' a temporary password is generated and returned — the ONLY time it
// exists in plain text, and the caller shows it to the admin once.
//
// One transaction: the request flips to approved and the password changes
// together, or neither happens. A request marked approved over a password that
// never changed would be a lie in the log.
async function approve(requestId, adminId) {
  const client = await db.getClient();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE password_requests
          SET status = 'approved', decided_by = $2, decided_at = now()
        WHERE request_id = $1 AND status = 'pending'
        RETURNING user_id, kind, new_password_hash`,
      [requestId, adminId]
    );
    const r = rows[0];
    if (!r) {
      await client.query("ROLLBACK");
      return null;
    }

    let temp = null;
    let hash = r.new_password_hash;
    if (r.kind === "forgot") {
      temp = temporaryPassword();
      hash = await bcrypt.hash(temp, 10);
    }
    const { rows: u } = await client.query(
      `UPDATE users SET password_hash = $1, updated_at = now()
        WHERE user_id = $2 RETURNING user_id, username, full_name`,
      [hash, r.user_id]
    );
    await client.query("COMMIT");
    return { userId: r.user_id, kind: r.kind, username: u[0].username, fullName: u[0].full_name, temp };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function reject(requestId, adminId, note) {
  const { rows } = await db.query(
    `UPDATE password_requests
        SET status = 'rejected', decided_by = $2, decided_at = now(),
            decision_note = $3
      WHERE request_id = $1 AND status = 'pending'
      RETURNING user_id, kind`,
    [requestId, adminId, note ? String(note).slice(0, 255) : null]
  );
  return rows[0] || null;
}

module.exports = {
  pendingFor, requestChange, requestForgot, cancelOwn,
  listPending, countPending, approve, reject, temporaryPassword,
  FORGOT_PER_IP, FORGOT_WINDOW_MINUTES,
};
