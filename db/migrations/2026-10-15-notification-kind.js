// ============================================================================
// db/migrations/2026-10-15-notification-kind.js
//
// Gabo, Oct 2026: the booking confirmation now goes out by SMS as well as
// email. Found while adding it: the confirmation and the day-before reminder
// were logged alike ("an email for this appointment"), and the reminder job
// skips an appointment that already has one — so every appointment that got a
// confirmation email never got its day-before reminder email.
//
// Each logged message now says what it was: 'reminder' (the day-before one)
// or 'confirmation' (sent the moment staff book or move an appointment). Old
// confirmation rows are recognised by their wording and tagged.
//
// Run BEFORE the new code goes live (it writes this column).
// Run: node db/migrations/2026-10-15-notification-kind.js   (safe to run twice)
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  await db.query(`ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS kind VARCHAR(12) NOT NULL DEFAULT 'reminder'`);
  await db.query(`DO $$ BEGIN
      ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
        CHECK (kind IN ('reminder', 'confirmation'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  const { rowCount } = await db.query(
    `UPDATE notifications SET kind = 'confirmation'
      WHERE kind = 'reminder' AND (message LIKE 'Kumpirmado:%' OR message LIKE 'Nailipat ang appointment%')`
  );
  console.log(`OK: notifications.kind ready; ${rowCount} earlier confirmation(s) tagged.`);
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
