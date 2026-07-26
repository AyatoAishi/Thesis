// One-off migration (M4.5): add email + family_email to patients.
// Safe to re-run (IF NOT EXISTS). Usage: node db/migrations/2026-07-02-add-patient-emails.js
require("dotenv").config();
const db = require("..");

(async () => {
  await db.query(`ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS email        VARCHAR(150),
    ADD COLUMN IF NOT EXISTS family_email VARCHAR(150)`);
  console.log("OK: patients.email + patients.family_email added.");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
