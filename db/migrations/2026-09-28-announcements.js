// ============================================================================
// db/migrations/2026-09-28-announcements.js
//
// "Add din sana tayo ng panel for special announcement na ibababa ng clinic
// kagaya ng mga libreng x-ray, medical, bakuna (para sa tigdas), vitamins …
// since wala naman sariling fb ang center nila." — Richelle, Sept 26.
//
// One row per announcement. It shows to patients from starts_on through
// ends_on (inclusive); ends_on NULL means "until somebody takes it down".
// Dates, not timestamps: a clinic event is on a day, and Manila's calendar day
// is what the patient reads.
//
// Run: node db/migrations/2026-09-28-announcements.js   (safe to run twice)
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS announcements (
    announcement_id SERIAL PRIMARY KEY,
    title       VARCHAR(120) NOT NULL,
    body        VARCHAR(1000) NOT NULL,
    starts_on   DATE NOT NULL,
    ends_on     DATE,
    created_by  INTEGER REFERENCES users(user_id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT announcements_dates CHECK (ends_on IS NULL OR ends_on >= starts_on)
  )`);
  await db.query(`CREATE INDEX IF NOT EXISTS announcements_window ON announcements (starts_on, ends_on)`);
  const { rows } = await db.query("SELECT count(*)::int AS n FROM announcements");
  console.log(`OK: announcements table ready (${rows[0].n} row(s)).`);
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
