// One-off migration: marks a medicine as a family planning commodity, so the
// Family Planning Acceptors report can pull exactly those dispenses without
// guessing from the medicine name (unlike the senior-citizen medicines,
// Alyanna's notes don't give a fixed name list for these).
// Safe to re-run (IF NOT EXISTS). Usage: node db/migrations/2026-08-08-add-family-planning-flag.js
require("dotenv").config();
const db = require("..");

(async () => {
  await db.query(`ALTER TABLE medicines
    ADD COLUMN IF NOT EXISTS is_family_planning BOOLEAN NOT NULL DEFAULT false`);
  console.log("OK: medicines.is_family_planning added.");

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
