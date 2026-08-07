// One-off migration (v1.2): dosage field on medicines, to distinguish
// otherwise-same-named medicines (e.g. Paracetamol 250mg vs 500mg) so the
// duplicate-medicine check can key off name+dosage instead of name alone.
// Safe to re-run (IF NOT EXISTS everywhere). Usage: node db/migrations/2026-08-08-v1.2-update.js
require("dotenv").config();
const db = require("..");

(async () => {
  await db.query(`ALTER TABLE medicines
    ADD COLUMN IF NOT EXISTS dosage VARCHAR(30)`);
  console.log("OK: medicines.dosage added.");

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
