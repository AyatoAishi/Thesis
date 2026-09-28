// ============================================================================
// db/migrations/2026-09-28-patient-parents.js
//
// "Dapat sa form palang nakahighlight na or kita na kung sino yung mga magulang
// ng bata — name of Mother and Father." — Richelle, Sept 26.
//
// A child's record held one "guardian name" and nothing else, so a baby's
// immunization page never said whose baby it was. The Todo Ligtas card and the
// barangay's own paper form both ask for the mother and the father separately.
//
// Two plain nullable text columns. Nullable because an adult's record has no
// use for them and because a parent is sometimes genuinely unknown; the form
// asks for them only when the patient is a minor. Nothing existing changes, so
// the live code that predates this keeps working against the new table.
//
// Run: node db/migrations/2026-09-28-patient-parents.js   (safe to run twice)
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  await db.query(`ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS mother_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS father_name VARCHAR(150)`);
  console.log("OK: patients.mother_name, father_name added.");

  const { rows } = await db.query(
    "SELECT count(*)::int AS total, count(*) FILTER (WHERE is_minor)::int AS minors FROM patients"
  );
  console.log(`   ${rows[0].total} patient(s), ${rows[0].minors} of them minors — parents can now be recorded for those.`);
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
