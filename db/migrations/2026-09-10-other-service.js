// One-off migration (2026-09-10): add an "other" service.
//
// "Sa service, mag add tayo ng 'others' + notes upon choosing others to specify
// ano ginawa niya that day. Minsan kasi may nag vvitals lang, bp, etc...
// ganern. For recording/tracking purposes lang naman." — Alyanna.
//
// The clinic had three services and the day's real work does not always fit
// one of them. Somebody who came in only to have their blood pressure taken
// had to be booked as immunization, prenatal or medicine distribution — so the
// attendance report counted a visit that never happened under a service that
// was never given, and the seasonal trend inherited the same lie. Recording
// nothing at all was the other option, which loses the visit entirely.
//
// No new column: appointments.notes has been there since the first schema and
// was already free text. What was missing was somewhere honest to file the
// visit against. The booking form makes notes required when this is the chosen
// service, because "Other" with an empty note records that something happened
// and nothing about what, which is barely better than not recording it.
//
// schedule_day is NULL deliberately. The other three are named after the day
// the clinic runs them; this one is whenever somebody walks in.
//
// Safe to re-run.
// Usage: node db/migrations/2026-09-10-other-service.js
require("dotenv").config();
const db = require("..");

(async () => {
  const { rows } = await db.query(
    `INSERT INTO services (name, schedule_day, description)
     SELECT 'other', NULL,
            'Anything outside the three regular services — vitals, blood pressure, a dressing change. Say what was done in the notes.'
      WHERE NOT EXISTS (SELECT 1 FROM services WHERE name = 'other')
     RETURNING service_id`
  );
  console.log(
    rows[0]
      ? `OK: "other" service added as service_id ${rows[0].service_id}.`
      : 'OK: "other" service already present, nothing to do.'
  );

  const all = await db.query("SELECT service_id, name, schedule_day FROM services ORDER BY service_id");
  console.log("Services now:");
  all.rows.forEach((r) =>
    console.log(`  ${r.service_id}  ${r.name}${r.schedule_day ? ` (${r.schedule_day})` : " (any day)"}`)
  );

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
