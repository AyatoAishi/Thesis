// ============================================================================
// db/migrations/2026-10-13-medicine-packaging.js
//
// Panel review, Oct 2026: deliveries arrive by the box, patients are given
// tablets. A medicine may now say what package it arrives in and how many
// pieces one holds, so a restock can be typed as "3 boxes" and the total read
// back as "320 tablets (3 boxes + 20)".
//
// Stock is still counted in pieces everywhere — stock_quantity, batches, the
// ledger, every dispense. These two columns only change how a delivery is
// typed in and how the total is shown. A medicine without them works exactly
// as before.
//
//   package_unit        'box', 'pack', 'bottle', 'strip', 'carton' — or NULL
//   pieces_per_package  how many of the medicine's unit one package holds
//
// Run BEFORE the new code goes live (the new code reads both columns).
// Run: node db/migrations/2026-10-13-medicine-packaging.js   (safe to run twice)
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  await db.query(`ALTER TABLE medicines ADD COLUMN IF NOT EXISTS package_unit VARCHAR(20)`);
  await db.query(`ALTER TABLE medicines ADD COLUMN IF NOT EXISTS pieces_per_package INTEGER`);
  await db.query(`ALTER TABLE medicines DROP CONSTRAINT IF EXISTS medicines_pieces_per_package_check`);
  await db.query(`ALTER TABLE medicines ADD CONSTRAINT medicines_pieces_per_package_check
                    CHECK (pieces_per_package IS NULL OR pieces_per_package BETWEEN 2 AND 10000)`);
  console.log("OK: medicine packaging columns ready.");
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
