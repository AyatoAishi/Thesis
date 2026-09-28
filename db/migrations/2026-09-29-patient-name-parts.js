// ============================================================================
// db/migrations/2026-09-29-patient-name-parts.js
//
// "When creating patient, rather than entire full name, separate the First
// name, Middle name and Last name. In this way we can separately organize
// every family." — the group's Sept 29 review.
//
// Three nullable columns BESIDE full_name, not instead of it. full_name stays
// the one column every screen, search, report, PDF and portal login already
// reads; the form now builds it from the three parts on every save. Replacing
// it would have meant touching all of those at once, days before the defense.
//
// Existing rows are NOT split here. A name like "Maria Clara Dela Cruz" cannot
// be split reliably by a machine (is "Clara" a middle name? is "Dela" part of
// the surname?), so the parts stay empty until a person opens the record in
// Edit, where the form offers a best guess for them to confirm (decided with
// the user, Sept 29). Until then the list sorts those rows by the last word
// of their full name.
//
// Run: node db/migrations/2026-09-29-patient-name-parts.js   (safe to run twice)
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  await db.query(`ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS first_name  VARCHAR(80),
    ADD COLUMN IF NOT EXISTS middle_name VARCHAR(80),
    ADD COLUMN IF NOT EXISTS last_name   VARCHAR(80)`);
  console.log("OK: patients.first_name, middle_name, last_name added.");
  const { rows } = await db.query(
    "SELECT count(*)::int AS total, count(last_name)::int AS split FROM patients"
  );
  console.log(`   ${rows[0].total} patient(s); ${rows[0].split} already have their name in parts.`);
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
