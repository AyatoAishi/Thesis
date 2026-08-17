// One-off migration: remember what happened to a portal account's password.
//
// Staff reported that resetting a patient's password "didn't save" — after
// signing out and back in, the account card looked untouched. It HAD saved;
// only the bcrypt hash is stored, so the one-time green box showing the actual
// temporary password can never be redrawn. What was missing was any lasting
// trace that the reset happened at all.
//
// These three columns are that trace. They also answer a question the system
// couldn't answer before: which patients are still walking around on a
// staff-issued temporary password they never changed.
//
// Safe to re-run (IF NOT EXISTS).
// Usage: node db/migrations/2026-08-17-portal-password-state.js
require("dotenv").config();
const db = require("..");

(async () => {
  await db.query(`ALTER TABLE patient_accounts
    ADD COLUMN IF NOT EXISTS temp_issued_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS temp_issued_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ`);
  console.log("OK: patient_accounts.temp_issued_at / temp_issued_by / password_changed_at added.");

  // Existing accounts predate the tracking. Their password was last set when
  // the account was created, so seed that instead of leaving a blank the page
  // would have to render as "unknown".
  const r = await db.query(
    `UPDATE patient_accounts SET temp_issued_at = created_at
      WHERE temp_issued_at IS NULL AND password_changed_at IS NULL`
  );
  console.log(`OK: backfilled ${r.rowCount} existing account(s) from created_at.`);

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
