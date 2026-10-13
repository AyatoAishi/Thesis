// ============================================================================
// db/migrations/2026-10-13-staff-password-state.js
//
// Panel review, Oct 2026: anyone still on a password somebody else gave them
// is asked to set their own every time they sign in (they may skip it).
// Portal accounts already know this (patient_accounts.password_changed_at).
// Staff accounts did not, so they get the same column:
//
//   users.password_changed_at   when the person last chose their own password.
//                               NULL = still on the one the admin set or issued.
//
// Existing accounts are worked out from their history, and only ever filled
// in, never cleared:
//   chose their own   an approved change request, or the admin changing
//                     their own password on My account
//   given one         an approved forgot-password request, or the admin
//                     setting the password from the staff list
// Whichever happened LAST decides. An account with no history at all is on
// the password it was created with, so it stays NULL and will be asked.
//
// Run BEFORE the new code goes live (the new sign-in reads this column).
// Run: node db/migrations/2026-10-13-staff-password-state.js   (safe to run twice)
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ`);

  const { rowCount } = await db.query(`
    WITH own AS (
      SELECT user_id, max(decided_at) AS at FROM password_requests
       WHERE status = 'approved' AND kind = 'change' GROUP BY user_id
      UNION ALL
      SELECT entity_id, max(created_at) FROM audit_log
       WHERE action = 'password_change' AND entity_type = 'user' AND user_id = entity_id
         AND (details LIKE 'changed own password%' OR details LIKE 'set own password%')
       GROUP BY entity_id
    ), own_last AS (
      SELECT user_id, max(at) AS at FROM own GROUP BY user_id
    ), given AS (
      SELECT user_id, max(decided_at) AS at FROM password_requests
       WHERE status = 'approved' AND kind = 'forgot' GROUP BY user_id
      UNION ALL
      SELECT entity_id, max(created_at) FROM audit_log
       WHERE action = 'password_change' AND entity_type = 'user'
         AND details LIKE 'set a new password for%'
       GROUP BY entity_id
    ), given_last AS (
      SELECT user_id, max(at) AS at FROM given GROUP BY user_id
    )
    UPDATE users u
       SET password_changed_at = o.at
      FROM own_last o
      LEFT JOIN given_last g ON g.user_id = o.user_id
     WHERE u.user_id = o.user_id
       AND u.password_changed_at IS NULL
       AND (g.at IS NULL OR o.at > g.at)`);

  const { rows } = await db.query(
    `SELECT username FROM users
      WHERE password_changed_at IS NULL AND status = 'active' AND deleted_at IS NULL
      ORDER BY username`
  );
  console.log("OK: users.password_changed_at ready.");
  console.log(`   ${rowCount} account(s) marked as having chosen their own password.`);
  console.log(`   ${rows.length} active account(s) will be asked to set their own at sign-in` +
    (rows.length ? `: ${rows.map((r) => r.username).join(", ")}` : "."));
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
