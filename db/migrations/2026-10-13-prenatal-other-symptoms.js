// ============================================================================
// db/migrations/2026-10-13-prenatal-other-symptoms.js
//
// Panel review, Oct 2026 (Alyanna's notes): the prenatal symptoms list needs
// an "Others" option, and anything staff add under Others becomes one of the
// symptom options from then on.
//
//   prenatal_symptom_options    the symptoms staff have added (one row each,
//                               unique regardless of capitals)
//   prenatal_records.other_symptoms / prenatal_visits.other_symptoms
//                               which of them this intake / check-up had
//
// The seven symptoms printed on the paper form stay as their own columns.
//
// Run: node db/migrations/2026-10-13-prenatal-other-symptoms.js   (safe to run twice)
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS prenatal_symptom_options (
      option_id  SERIAL PRIMARY KEY,
      label      VARCHAR(80) NOT NULL,
      created_by INT REFERENCES users(user_id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS prenatal_symptom_options_label
                    ON prenatal_symptom_options (lower(label))`);
  await db.query(`ALTER TABLE prenatal_records
                    ADD COLUMN IF NOT EXISTS other_symptoms TEXT[] NOT NULL DEFAULT '{}'`);
  await db.query(`ALTER TABLE prenatal_visits
                    ADD COLUMN IF NOT EXISTS other_symptoms TEXT[] NOT NULL DEFAULT '{}'`);
  console.log("OK: prenatal 'Others' symptoms ready.");
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
