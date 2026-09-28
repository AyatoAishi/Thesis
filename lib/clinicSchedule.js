// ============================================================================
// lib/clinicSchedule.js — which service runs on which day of the week.
//
// Read from services.schedule_day: the same column the immunization
// auto-scheduler books babies from (services/immunizationSchedule.js). The
// portal's schedule box (Richelle's mockup, Sept 26) shows that column rather
// than a copy of it, so the day a patient is told and the day the system books
// can never drift apart. Confirmed by the group Sept 28: Tuesday immunization,
// Thursday prenatal, Friday medicine distribution.
// ============================================================================
const db = require("../db");
const F = require("./format");

async function weekly() {
  const { rows } = await db.query(
    "SELECT name, schedule_day FROM services WHERE schedule_day IS NOT NULL"
  );
  return rows
    .filter((r) => F.DAYS.includes(r.schedule_day))
    .sort((a, b) => F.DAYS.indexOf(a.schedule_day) - F.DAYS.indexOf(b.schedule_day));
}

// Extra information on a page, so a failed query shows no box rather than an
// error page.
async function weeklySafe() {
  try { return await weekly(); } catch (e) { console.error("[schedule]", e.message); return []; }
}

module.exports = { weekly, weeklySafe };
