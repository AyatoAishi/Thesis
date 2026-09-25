// ============================================================================
// lib/backup.js — a full snapshot of the clinic's data, as one JSON file.
//
// "Need backup database" — the professors' review. The database lives on
// Neon's free plan, whose own restore window is short, and nothing here was
// exporting a copy anywhere. A thesis system that loses a barangay's patient
// records because a free tier rolled over is not a system anybody should hand
// over.
//
// WHAT IS IN IT. Every table, every row, in an order that restores cleanly
// (parents before children). Two tables are left out on purpose: `session`
// (live sign-ins — restoring them would resurrect old logins) and
// `login_attempts` (a rolling security counter with no value after the fact).
//
// WHAT IT IS NOT. It is not encrypted, and it holds every patient's medical
// record and every staff password hash. It must be kept like the paper files:
// on the clinic's own storage, never emailed, never uploaded anywhere public.
// backups/ is gitignored because this repository is PUBLIC.
//
// Used two ways: `node db/backup.js` writes a file into backups/, and the
// admin can download the same snapshot from Staff accounts.
// ============================================================================
const db = require("../db");

// Restore order: a table appears after everything it references.
const TABLES = [
  "users", "services", "patients", "patient_accounts", "password_resets", "password_requests",
  "appointments", "visits", "immunization_records",
  "prenatal_records", "prenatal_visits", "prenatal_children",
  "medicines", "medicine_batches", "medicine_dispenses", "stock_movements",
  "notifications", "audit_log",
];
const SKIPPED = ["session", "login_attempts"];

async function snapshot() {
  const out = {
    system: "Sampaguita Health Clinic EMR",
    format: 1,
    created_at: new Date().toISOString(),
    skipped: SKIPPED,
    tables: {},
    counts: {},
  };
  // Tables that do not exist on an older database are skipped, not fatal — a
  // backup that refuses to run because one feature's migration has not been
  // applied would be no backup at all.
  const { rows: present } = await db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
  );
  const have = new Set(present.map((r) => r.table_name));
  for (const t of TABLES) {
    if (!have.has(t)) continue;
    const { rows } = await db.query(`SELECT * FROM ${t}`);   // t is from the fixed list above, never input
    out.tables[t] = rows;
    out.counts[t] = rows.length;
  }
  // Anything new that nobody has added to the list is still included, at the
  // end, rather than silently missing from every backup from now on.
  for (const t of [...have].sort()) {
    if (TABLES.includes(t) || SKIPPED.includes(t) || !/^[a-z_]+$/.test(t)) continue;
    const { rows } = await db.query(`SELECT * FROM ${t}`);
    out.tables[t] = rows;
    out.counts[t] = rows.length;
  }
  return out;
}

const filenameFor = (d = new Date()) =>
  `sampaguita-backup-${d.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;

module.exports = { snapshot, filenameFor, TABLES, SKIPPED };
