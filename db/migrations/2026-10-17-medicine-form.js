// ============================================================================
// db/migrations/2026-10-17-medicine-form.js
//
// Panel, Oct 2026: "gawing main category ang bottle, box, etc. then
// subcategory ang syrup, tablet." The category is what a medicine comes in
// (stored as before, in unit / package_unit); the subcategory is what it is,
// and it gets its own column: medicines.form (lib/medicineUnits.js).
//
// Backfill: tablets/capsules/suppositories are their own form; a vial or an
// ampule is an injection; an old "syrup" unit becomes Bottle › Syrup — still
// counted one bottle at a time, so the stock number means the same thing.
//
// Run BEFORE the new code goes live (it writes this column).
// Run: node db/migrations/2026-10-17-medicine-form.js   (safe to run twice)
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  await db.query("ALTER TABLE medicines ADD COLUMN IF NOT EXISTS form VARCHAR(40)");
  const a = await db.query(
    `UPDATE medicines SET form = lower(unit)
      WHERE form IS NULL AND lower(unit) IN ('tablet', 'capsule', 'suppository', 'condom')`
  );
  const b = await db.query(
    `UPDATE medicines SET form = 'injection'
      WHERE form IS NULL AND lower(unit) IN ('vial', 'ampule')`
  );
  const c = await db.query(
    `UPDATE medicines SET unit = 'bottle', form = 'syrup'
      WHERE lower(unit) = 'syrup'`
  );
  console.log(`OK: medicines.form ready (${a.rowCount} tablets/capsules, ${b.rowCount} injections, ${c.rowCount} syrups moved to Bottle › Syrup).`);
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
