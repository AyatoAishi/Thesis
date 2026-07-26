// One-off migration (M6): add requires_doctor_approval to medicines.
// Safe to re-run (IF NOT EXISTS). Usage: node db/migrations/2026-07-27-add-medicine-approval-flag.js
require("dotenv").config();
const db = require("..");

(async () => {
  await db.query(`ALTER TABLE medicines
    ADD COLUMN IF NOT EXISTS requires_doctor_approval BOOLEAN NOT NULL DEFAULT false`);
  console.log("OK: medicines.requires_doctor_approval added.");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
