// ============================================================================
// db/migrations/2026-09-25-patient-deceased.js
//
// "Add a 'Mark as deceased'" — the professors' review.
//
// A date and who recorded it, never a deletion. The record of a person who
// has died is still a medical record, still counted in the reports for the
// period they were a patient, and may still be asked for by their family. What
// changes is that the system stops treating them as somebody to schedule,
// remind, or chase for an overdue vaccine.
//
// NULL means living. Undoing a mistaken mark is setting it back to NULL, and
// the activity log keeps the fact that it happened.
//
// Run: node db/migrations/2026-09-25-patient-deceased.js
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  await db.query(`ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS deceased_at DATE,
    ADD COLUMN IF NOT EXISTS deceased_recorded_by INTEGER REFERENCES users(user_id),
    ADD COLUMN IF NOT EXISTS deceased_note VARCHAR(255)`);
  console.log("OK: patients.deceased_at, deceased_recorded_by, deceased_note added.");

  const { rows } = await db.query(
    "SELECT count(*)::int AS total, count(deceased_at)::int AS deceased FROM patients"
  );
  console.log(`   ${rows[0].total} patient(s), ${rows[0].deceased} marked deceased.`);
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
