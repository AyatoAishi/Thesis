// One-off migration: adds a remarks column to the existing (never-wired-up)
// immunization_records table so it matches the paper "Immunization Card"'s
// Remarks column. The table itself already exists in schema.sql from the
// original M2 plan — it was just never built out into routes/views.
// Safe to re-run (IF NOT EXISTS). Usage: node db/migrations/2026-08-08-immunization-remarks.js
require("dotenv").config();
const db = require("..");

(async () => {
  await db.query(`ALTER TABLE immunization_records
    ADD COLUMN IF NOT EXISTS remarks VARCHAR(255)`);
  console.log("OK: immunization_records.remarks added.");

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
