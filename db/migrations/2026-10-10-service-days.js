// ============================================================================
// db/migrations/2026-10-10-service-days.js
//
// "Ulit guys, schedule: Tuesday preggy, Thurs vaccine for babies, MWF medicine
// distribution." — Alyanna, Oct 10. The days on file were swapped (Tuesday
// immunization / Thursday prenatal), and medicine distribution runs three days
// a week, not only Friday.
//
// services.schedule_day becomes a comma-separated list of weekday names, e.g.
// "Monday,Wednesday,Friday" (lib/clinicSchedule.js parseDays reads it), so the
// column is widened from VARCHAR(15).
//
// Run: node db/migrations/2026-10-10-service-days.js   (safe to run twice)
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  await db.query("ALTER TABLE services ALTER COLUMN schedule_day TYPE VARCHAR(60)");
  await db.query("UPDATE services SET schedule_day = 'Tuesday' WHERE name = 'prenatal'");
  await db.query("UPDATE services SET schedule_day = 'Thursday' WHERE name = 'immunization'");
  await db.query("UPDATE services SET schedule_day = 'Monday,Wednesday,Friday' WHERE name = 'medicine_distribution'");
  const { rows } = await db.query("SELECT name, schedule_day FROM services ORDER BY service_id");
  console.log("OK: service days updated.");
  rows.forEach((r) => console.log(`   ${r.name.padEnd(22)} ${r.schedule_day || "(no fixed day)"}`));
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
