// One-off migration (2026-08-20): two additions, both from classmate feedback.
//
// 1) patients.reminder_channel
//    Until now every appointment reminder went out on BOTH channels to
//    everybody. For a patient with a phone and no email that meant a guaranteed
//    "failed" row in the log every single time — 4 of the 26 email failures on
//    record are nothing but that. Staff asked to choose per patient, which is
//    also the honest thing to record: an old woman with no email address has
//    not "failed" to be reminded, she is reminded another way.
//
// 2) password_resets
//    The patient-side forgot-password flow. Only a SHA-256 of the token is
//    stored — the token itself exists in exactly one place, the email that was
//    sent. Anyone who reads this table, including us, cannot reset anybody's
//    password with what they find here. Rows are kept after use so that "who
//    asked for a reset, and when" stays answerable.
//
// Safe to re-run (IF NOT EXISTS throughout).
// Usage: node db/migrations/2026-08-20-reminder-channel-and-password-reset.js
require("dotenv").config();
const db = require("..");

(async () => {
  await db.query(`ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS reminder_channel VARCHAR(10) NOT NULL DEFAULT 'both'`);
  console.log("OK: patients.reminder_channel added (default 'both').");

  // Added separately so a re-run doesn't trip over an existing constraint.
  await db.query(`DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_reminder_channel_chk') THEN
        ALTER TABLE patients ADD CONSTRAINT patients_reminder_channel_chk
          CHECK (reminder_channel IN ('both','email','sms','none'));
      END IF;
    END $$`);
  console.log("OK: reminder_channel limited to both/email/sms/none.");

  await db.query(`CREATE TABLE IF NOT EXISTS password_resets (
    reset_id     SERIAL PRIMARY KEY,
    account_id   INTEGER NOT NULL REFERENCES patient_accounts(account_id) ON DELETE CASCADE,
    token_hash   VARCHAR(64) NOT NULL,          -- sha256 hex of the emailed token
    sent_to      VARCHAR(150),                  -- where the link went, for the trail
    expires_at   TIMESTAMPTZ NOT NULL,
    used_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets (token_hash)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_password_resets_account ON password_resets (account_id)`);
  console.log("OK: password_resets created.");

  const { rows } = await db.query(
    `SELECT count(*)::int AS n,
            count(*) FILTER (WHERE email IS NOT NULL AND email <> '')::int AS with_email
       FROM patients`
  );
  console.log(`Note: ${rows[0].with_email} of ${rows[0].n} patients have an email address on file.`);

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
