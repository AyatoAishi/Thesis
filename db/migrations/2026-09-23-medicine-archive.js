// ============================================================================
// db/migrations/2026-09-23-medicine-archive.js
//
// Adds medicines.archived_at, so a medicine can be taken off the shelf without
// being erased.
//
// Why archive and not DELETE. medicine_dispenses.medicine_id is a NOT NULL
// foreign key with no ON DELETE clause, so deleting a medicine that has ever
// been handed to a patient simply fails — Postgres refuses, and rightly. The
// row is not just an inventory line; it is what a dispense record points at to
// say what the patient was given. Delete it and either the database blocks you
// or, with a cascade, you silently destroy the medical record of every person
// who ever received it.
//
// So: archived_at is a timestamp, NULL means on the shelf. Nothing is ever
// removed, and a wrong archive is undone by setting it back to NULL.
//
// Run: node db/migrations/2026-09-23-medicine-archive.js
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  await db.query(`ALTER TABLE medicines
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
  console.log("OK: medicines.archived_at added.");

  // Every list, dropdown and count filters on "archived_at IS NULL", and the
  // inventory page runs that on every load.
  await db.query(`CREATE INDEX IF NOT EXISTS idx_medicines_active
    ON medicines (archived_at) WHERE archived_at IS NULL`);
  console.log("OK: partial index on active medicines.");

  const { rows } = await db.query(
    `SELECT count(*)::int AS total,
            count(archived_at)::int AS archived
       FROM medicines`
  );
  console.log(`   ${rows[0].total} medicine(s), ${rows[0].archived} archived.`);
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
