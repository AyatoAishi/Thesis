// ============================================================================
// lib/passwordReset.js — the patient-side "I forgot my password" flow.
//
// Added 2026-08-20, after two teammates pointed out that sending every
// forgotten password back to the front desk is work the staff shouldn't have
// to do. It sits ALONGSIDE the desk reset in routes/portalAccounts.js, which
// stays: only 5 of 11 patients have an email address on file, and the ones who
// don't are largely the elderly, who need help the most.
//
// This is deliberately NOT the recovery code that was removed on 2026-08-16.
// That was a slip of paper the patient carried, which someone who has lost
// their password has usually lost too. A link sent to an address the clinic
// already holds needs the patient to remember nothing at all.
//
// How it is kept safe:
//
//   - The token is 32 random bytes. Only its SHA-256 is stored, so this table
//     cannot be used to reset anybody's password — not by an attacker who
//     reads the database, and not by us. The token exists in exactly one
//     place: the email that was sent.
//   - One hour to live, and one use. Redeeming is a single UPDATE ... WHERE
//     used_at IS NULL RETURNING, so two clicks on the same link cannot both
//     win, however close together they land.
//   - Two minutes between sends for the same account, so the link cannot be
//     used to bomb someone's inbox.
//   - Matching is on the PATIENT's own email only, never the emergency
//     contact's. Reminders fall back to the family address because a missed
//     appointment is not a secret; a password is. A spouse or neighbour listed
//     as the emergency contact must not be able to open somebody's medical
//     record.
// ============================================================================
const crypto = require("crypto");
const db = require("../db");
const email = require("../services/email");

const TTL_MINUTES = 60;
const RESEND_COOLDOWN_SECONDS = 120;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const hashToken = (t) => crypto.createHash("sha256").update(t).digest("hex");

function isEmail(v) {
  return EMAIL_RE.test((v || "").trim());
}

// The portal account attached to this email address, or null.
// Matches the patient's own email, case-insensitively, and only where a portal
// account actually exists — a patient with no account has nothing to reset.
async function findAccountByEmail(rawEmail) {
  const { rows } = await db.query(
    `SELECT a.account_id, a.username, p.patient_id, p.full_name, p.email
       FROM patient_accounts a
       JOIN patients p ON p.patient_id = a.patient_id
      WHERE lower(trim(p.email)) = lower(trim($1))
      LIMIT 1`,
    [rawEmail]
  );
  return rows[0] || null;
}

// Mint a reset token for an account. Returns the raw token, or null if one was
// already sent within the cooldown (in which case nothing is sent again — the
// earlier link is still good).
async function issueToken(accountId, sentTo) {
  const recent = await db.query(
    `SELECT 1 FROM password_resets
      WHERE account_id = $1 AND used_at IS NULL AND expires_at > now()
        AND created_at > now() - ($2 || ' seconds')::interval
      LIMIT 1`,
    [accountId, RESEND_COOLDOWN_SECONDS]
  );
  if (recent.rowCount) return null;

  const token = crypto.randomBytes(32).toString("hex");
  await db.query(
    `INSERT INTO password_resets (account_id, token_hash, sent_to, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [accountId, hashToken(token), sentTo, TTL_MINUTES]
  );
  return token;
}

// Is this token still good? Read-only — used to decide whether to draw the
// form. Redeeming happens in redeemToken.
async function checkToken(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const { rows } = await db.query(
    `SELECT r.account_id, p.full_name, a.username
       FROM password_resets r
       JOIN patient_accounts a ON a.account_id = r.account_id
       JOIN patients p ON p.patient_id = a.patient_id
      WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now()`,
    [hashToken(token)]
  );
  return rows[0] || null;
}

// Spend the token. Atomic: the UPDATE both checks and consumes, so a link
// opened twice can only work once. Returns the account_id, or null.
async function redeemToken(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const { rows } = await db.query(
    `UPDATE password_resets
        SET used_at = now()
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
      RETURNING account_id`,
    [hashToken(token)]
  );
  return rows[0] ? rows[0].account_id : null;
}

// Any other unused links for this account die once one is spent — otherwise a
// patient who pressed "forgot password" three times leaves three live keys
// lying around in their inbox.
async function invalidateOthers(accountId) {
  const { rowCount } = await db.query(
    `UPDATE password_resets SET used_at = now()
      WHERE account_id = $1 AND used_at IS NULL`,
    [accountId]
  );
  return rowCount;
}

function buildResetEmail({ full_name, username, link }) {
  return {
    subject: "Pagpapalit ng password — Sampaguita Health Clinic",
    text:
      `Magandang araw po, ${full_name}!\n\n` +
      `May humiling na palitan ang password ng portal account "${username}".\n` +
      `Pindutin po ang link na ito para maglagay ng bagong password:\n\n${link}\n\n` +
      `Isang oras lang po itong gumagana, at isang beses lang magagamit.\n\n` +
      `Kung hindi po kayo ang humiling nito, huwag pong pansinin ang email na ito — ` +
      `walang mababago sa account ninyo hangga't hindi napipindot ang link.\n\n` +
      `— Sampaguita Health Clinic`,
    html:
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.6">` +
      `<p>Magandang araw po, <b>${full_name}</b>!</p>` +
      `<p>May humiling na palitan ang password ng portal account <b>${username}</b>.</p>` +
      `<p><a href="${link}" style="display:inline-block;background:#3b6cf5;color:#fff;` +
      `padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">` +
      `Maglagay ng bagong password</a></p>` +
      `<p style="font-size:12.5px;color:#666">Kung hindi gumagana ang buton, kopyahin po ito:<br/>` +
      `<span style="word-break:break-all">${link}</span></p>` +
      `<p><b>Isang oras</b> lang po itong gumagana, at <b>isang beses</b> lang magagamit.</p>` +
      `<p style="font-size:12.5px;color:#666">Kung hindi po kayo ang humiling nito, huwag pong ` +
      `pansinin ang email na ito — walang mababago sa account ninyo hangga't hindi napipindot ` +
      `ang link.</p>` +
      `<p>— Sampaguita Health Clinic</p></div>`,
  };
}

// Send the link. Also writes the attempt to `notifications`, so a reset that
// never arrives shows up on the Reminders page next to everything else that
// failed to leave the building, instead of vanishing.
async function sendResetLink({ account, token, baseUrl }) {
  const link = `${baseUrl}/portal/reset/${token}`;
  const mail = buildResetEmail({
    full_name: account.full_name,
    username: account.username,
    link,
  });
  const r = await email.sendMail({ to: account.email, ...mail });
  try {
    await db.query(
      `INSERT INTO notifications
         (patient_id, channel, recipient, recipient_type, message, status, provider_response, sent_at)
       VALUES ($1,'email',$2,'patient',$3,$4,$5,$6)`,
      [
        account.patient_id,
        account.email,
        "Password reset link",
        r.sent ? "sent" : "failed",
        r.response,
        r.sent ? new Date() : null,
      ]
    );
  } catch (e) {
    console.error("[passwordReset] could not log notification:", e.message);
  }
  return r;
}

module.exports = {
  TTL_MINUTES,
  isEmail,
  findAccountByEmail,
  issueToken,
  checkToken,
  redeemToken,
  invalidateOthers,
  buildResetEmail,
  sendResetLink,
};
