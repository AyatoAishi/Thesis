// ============================================================================
// db/migrations/2026-10-13-drop-valid-id-number.js
//
// Panel review, Oct 2026 (Alyanna's notes): "Remove ID Number, no need
// iistore. Kahit yung ID lang na ginamit." The portal account keeps which
// kind of valid ID was checked (valid_id_type); the number on it is erased
// and the column removed, so it cannot quietly start being filled again.
//
// RUN THIS ONLY AFTER the new code is live on Render. The previous version
// still reads this column, and would error on the patient page and the
// portal-accounts list if it vanished first.
//
// Run: node db/migrations/2026-10-13-drop-valid-id-number.js   (safe to run twice)
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_name = 'patient_accounts' AND column_name = 'valid_id_number'`
  );
  if (!rows[0].n) {
    console.log("OK: valid_id_number is already gone.");
    process.exit(0);
  }
  const before = await db.query(
    "SELECT count(*)::int AS n FROM patient_accounts WHERE valid_id_number IS NOT NULL"
  );
  await db.query("ALTER TABLE patient_accounts DROP COLUMN valid_id_number");
  console.log(`OK: erased ${before.rows[0].n} stored ID number(s) and removed the column.`);
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
