// ============================================================================
// lib/clinicSchedule.js — which service runs on which day of the week.
//
// Read from services.schedule_day: the same column the immunization
// auto-scheduler books babies from (services/immunizationSchedule.js). The
// portal's schedule box (Richelle's mockup, Sept 26) shows that column rather
// than a copy of it, so the day a patient is told and the day the system books
// can never drift apart.
//
// Confirmed by the group Oct 10 (Alyanna): Tuesday prenatal, Thursday
// immunization, Monday / Wednesday / Friday medicine distribution. A service
// can run on several days, so schedule_day holds a comma-separated list
// ("Monday,Wednesday,Friday"); parseDays() is the one place that reads it.
// ============================================================================
const db = require("../db");
const F = require("./format");

// "Monday, Wednesday,Friday" -> ["Monday", "Wednesday", "Friday"], real
// weekday names only, in week order.
function parseDays(value) {
  return String(value || "")
    .split(",")
    .map((d) => d.trim())
    .filter((d) => F.DAYS.includes(d))
    .sort((a, b) => F.DAYS.indexOf(a) - F.DAYS.indexOf(b));
}

// One row per (day, service), in week order: Monday medicine, Tuesday
// prenatal, Wednesday medicine, ... — what the schedule box lists.
async function weekly() {
  const { rows } = await db.query(
    "SELECT name, schedule_day FROM services WHERE schedule_day IS NOT NULL ORDER BY service_id"
  );
  const out = [];
  for (const r of rows) for (const day of parseDays(r.schedule_day)) out.push({ name: r.name, schedule_day: day });
  return out.sort((a, b) => F.DAYS.indexOf(a.schedule_day) - F.DAYS.indexOf(b.schedule_day));
}

// Extra information on a page, so a failed query shows no box rather than an
// error page.
async function weeklySafe() {
  try { return await weekly(); } catch (e) { console.error("[schedule]", e.message); return []; }
}

module.exports = { weekly, weeklySafe, parseDays };
