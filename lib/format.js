// ============================================================================
// lib/format.js — shared date + label helpers (Asia/Manila aware).
// The server may run in UTC (Render) while the clinic operates in Manila,
// so "today" and weekday math must be timezone-explicit, never naive new Date().
// ============================================================================
const TZ = "Asia/Manila";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Today's date in the clinic's timezone, formatted 'YYYY-MM-DD' (en-CA gives ISO).
function manilaToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

// Weekday index (0=Sun..6=Sat) of a 'YYYY-MM-DD' string — built in UTC so it
// never drifts with the server's local timezone.
function weekdayOf(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Weekday name of a date string, e.g. 'Tuesday'.
function weekdayName(dateStr) {
  return DAYS[weekdayOf(dateStr)];
}

// Add n days to a 'YYYY-MM-DD' string, return a new 'YYYY-MM-DD' string.
function addDays(dateStr, n) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// Prettify a stored service name: 'medicine_distribution' -> 'Medicine distribution'.
function prettyService(name) {
  if (!name) return "";
  const s = String(name).replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// '2026-06-30' -> 'Tuesday, June 30, 2026'. Formatted in UTC to match weekdayOf.
function longDate(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });
}

// '14:30:00' or '14:30' -> '2:30 PM'. Returns '' for null/empty.
function shortTime(t) {
  if (!t) return "";
  const [hh, mm] = String(t).split(":");
  let h = parseInt(hh, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${mm} ${ampm}`;
}

module.exports = {
  TZ, DAYS, manilaToday, weekdayOf, weekdayName, addDays, prettyService, longDate, shortTime,
};
