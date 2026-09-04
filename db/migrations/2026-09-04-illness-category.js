// One-off migration (2026-09-04): add visits.diagnosis_category.
//
// The seasonal report was built on appointments — how many people came for
// immunization, prenatal, medicine — because when it was written nothing in
// the app ever wrote a visits row. routes/visits.js changed that on
// 2026-08-17, so the clinic now records a diagnosis for every consultation,
// and the question the report could not answer becomes answerable: not just
// how many came, but what they came with.
//
// It needs a column of its own rather than a GROUP BY on `diagnosis`, because
// that column is free text. See lib/illnesses.js for the argument.
//
// Nothing is backfilled. There is nothing to backfill — the column is new and
// every existing visit predates it. Old rows keep NULL and the report counts
// them under "Not recorded", which is the truth about them.
//
// Safe to re-run.
// Usage: node db/migrations/2026-09-04-illness-category.js
require("dotenv").config();
const db = require("..");

(async () => {
  await db.query(
    `ALTER TABLE visits ADD COLUMN IF NOT EXISTS diagnosis_category VARCHAR(60)`
  );
  console.log("OK: visits.diagnosis_category added.");

  // The report groups by this column across a date range, every time someone
  // opens the page.
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_visits_category_date
       ON visits (diagnosis_category, visit_date)`
  );
  console.log("OK: idx_visits_category_date ready.");

  const { rows } = await db.query(
    `SELECT count(*)::int AS total,
            count(diagnosis_category)::int AS categorised
       FROM visits`
  );
  console.log(
    `Note: ${rows[0].total} visit(s) recorded, ${rows[0].categorised} with a category. ` +
      `The rest predate the column and count as "Not recorded".`
  );

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
