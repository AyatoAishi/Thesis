// One-off migration (v1 update, post-launch): family grouping, privacy consent,
// and a lightweight audit log for role/record accountability (professor's revision notes).
// Safe to re-run (IF NOT EXISTS everywhere). Usage: node db/migrations/2026-08-02-v1-update.js
require("dotenv").config();
const db = require("..");

(async () => {
  await db.query(`ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS family_number VARCHAR(30),
    ADD COLUMN IF NOT EXISTS privacy_consent BOOLEAN NOT NULL DEFAULT false`);
  console.log("OK: patients.family_number, patients.privacy_consent added.");

  await db.query(`CREATE INDEX IF NOT EXISTS idx_patients_family_number ON patients (family_number)`);
  console.log("OK: index on patients.family_number added.");

  await db.query(`CREATE TABLE IF NOT EXISTS audit_log (
    audit_id     SERIAL PRIMARY KEY,
    user_id      INTEGER REFERENCES users(user_id),
    action       VARCHAR(40) NOT NULL,
    entity_type  VARCHAR(30),
    entity_id    INTEGER,
    details      VARCHAR(255),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  console.log("OK: audit_log table ready.");

  await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC)`);
  console.log("OK: index on audit_log.created_at added.");

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
