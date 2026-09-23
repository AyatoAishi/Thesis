// ============================================================================
// lib/calendar.js — the month grid behind the dashboard calendar.
//
// "Nagsuggest siya if pwede maglagay ng malaking calendar sa Dashboard, tas
// napipindot yung day tsaka dun lalabas mga schedules" — Niel, and he is right
// about the gap: this is a scheduling system whose front page had no calendar
// on it. Numbers in boxes tell you how many; a calendar tells you WHEN, and
// when is the whole question a clinic asks.
//
// All dates here are plain "YYYY-MM-DD" strings in Asia/Manila, never Date
// objects in local time. A Date built from "2026-10-01" is midnight UTC, which
// in Manila is already 8am on the 1st — but go the other way, format a Manila
// evening back to ISO, and the day slides by one. Every off-by-one-day bug in
// a calendar is this, so the grid is built by arithmetic on the string parts
// and a Date is only ever used inside UTC helpers that cannot drift.
// ============================================================================

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

// Days in a month, 1-indexed month. Day 0 of the next month is the last day of
// this one, and Date.UTC handles the leap year so we do not have to.
function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Which weekday a date falls on, 0 = Sunday. UTC throughout, so the answer
// does not depend on where the server is standing.
function weekdayIndex(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// "2026-10" -> { y, m }. Anything unparseable falls back to the month given,
// because a bad ?m= in the URL should show this month rather than a stack trace.
function parseMonth(value, fallbackISO) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12) return { y, m: mo };
  }
  const [fy, fm] = fallbackISO.split("-").map(Number);
  return { y: fy, m: fm };
}

const shiftMonth = ({ y, m }, by) => {
  const total = y * 12 + (m - 1) + by;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
};

const monthKey = ({ y, m }) => `${y}-${pad(m)}`;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Build the grid. `counts` maps "YYYY-MM-DD" -> { total, missed, ... } for the
// month; any day not in it simply has no appointments.
//
// Leading and trailing blanks rather than the neighbouring months' dates: a
// greyed-out 30th of September sitting in the October grid is pressable-looking
// and means nothing here, and somebody will press it.
function buildMonth({ y, m }, counts, todayISO, selectedISO) {
  const first = iso(y, m, 1);
  const lead = weekdayIndex(first);
  const total = daysInMonth(y, m);

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= total; d++) {
    const date = iso(y, m, d);
    const c = counts[date] || null;
    cells.push({
      date,
      day: d,
      isToday: date === todayISO,
      isSelected: date === selectedISO,
      isPast: date < todayISO,
      count: c ? c.total : 0,
      missed: c ? c.missed : 0,
      scheduled: c ? c.scheduled : 0,
    });
  }
  // Pad to whole weeks so the grid does not change height as months change —
  // a calendar that jumps when you press "next" reads as a glitch.
  while (cells.length % 7) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return {
    y,
    m,
    label: `${MONTH_NAMES[m - 1]} ${y}`,
    key: monthKey({ y, m }),
    prev: monthKey(shiftMonth({ y, m }, -1)),
    next: monthKey(shiftMonth({ y, m }, 1)),
    firstDay: first,
    lastDay: iso(y, m, total),
    weeks,
  };
}

// A date is only accepted if it is a real calendar date, so ?d=2026-02-31 does
// not become a page showing nothing with no explanation.
function validDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!m) return null;
  const [, ys, ms, ds] = m;
  const y = Number(ys), mo = Number(ms), d = Number(ds);
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > daysInMonth(y, mo)) return null;
  return iso(y, mo, d);
}

module.exports = {
  buildMonth, parseMonth, shiftMonth, monthKey, validDate,
  daysInMonth, weekdayIndex, MONTH_NAMES,
  WEEKDAYS: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};
