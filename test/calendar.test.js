// ============================================================================
// test/calendar.test.js — the month grid, which is pure arithmetic and
// therefore the one thing here that can be checked without a database.
//
// Every off-by-one-day bug in a calendar is a timezone bug: a Date built from
// "2026-10-01" is midnight UTC, which is already 8am on the 1st in Manila, and
// formatting a Manila evening back to ISO slides the day the other way. So
// lib/calendar.js never leaves the string domain except inside Date.UTC, and
// these checks are what hold that line.
//
// The last two are the ones that matter most: across twelve months, no day may
// be duplicated and none may go missing. A grid that quietly drops the 31st
// hides a day of appointments, and nobody finds out until somebody does not
// arrive.
// ============================================================================
const cal = require("../lib/calendar");

let bad = 0;
const check = (label, ok, extra = "") => {
  if (!ok) bad++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${extra ? "   " + extra : ""}`);
};

check("February 2028 has 29 days", cal.daysInMonth(2028, 2) === 29);
check("February 2026 has 28", cal.daysInMonth(2026, 2) === 28);
// 2100 is divisible by 4 but not 400, so it is NOT a leap year. Hand-rolled
// leap logic gets this wrong; Date.UTC does not.
check("February 2100 is not a leap year", cal.daysInMonth(2100, 2) === 28);
check("1 October 2026 is a Thursday", cal.weekdayIndex("2026-10-01") === 4);

const grid = cal.buildMonth(
  { y: 2026, m: 10 },
  { "2026-10-03": { total: 3, missed: 1, scheduled: 2 } },
  "2026-09-23",
  "2026-10-03"
);
check("grid is made of whole weeks", grid.weeks.every((w) => w.length === 7));
check("October has 31 day cells", grid.weeks.flat().filter(Boolean).length === 31);
check("month bounds are right", grid.firstDay === "2026-10-01" && grid.lastDay === "2026-10-31");

const third = grid.weeks.flat().find((c) => c && c.date === "2026-10-03");
check("counts land on the right day", third.count === 3 && third.missed === 1);
check("the selected day is marked", third.isSelected === true);
check("today is marked separately from selected", third.isToday === false);

check("31 February is refused", cal.validDate("2026-02-31") === null);
check("a real date is accepted", cal.validDate("2026-10-03") === "2026-10-03");
check("rubbish is refused", cal.validDate("nope") === null && cal.validDate("2026-13-01") === null);

check("January's previous month is last December", cal.monthKey(cal.shiftMonth({ y: 2026, m: 1 }, -1)) === "2025-12");
check("December's next month is next January", cal.monthKey(cal.shiftMonth({ y: 2026, m: 12 }, 1)) === "2027-01");
check("a rubbish ?m= falls back to the current month", cal.parseMonth("nope", "2026-09-23").m === 9);

let dupes = 0;
let wrongLength = 0;
for (let m = 1; m <= 12; m++) {
  const g = cal.buildMonth({ y: 2027, m }, {}, "2027-01-01", "2027-01-01");
  const days = g.weeks.flat().filter(Boolean).map((c) => c.day);
  if (new Set(days).size !== days.length) dupes++;
  if (days.length !== cal.daysInMonth(2027, m)) wrongLength++;
}
check("twelve months, no duplicated day", dupes === 0);
check("twelve months, no missing day", wrongLength === 0);

console.log(
  bad ? `\n${bad} check(s) failed.` : "\nThe grid is sound in every month, and the string domain held."
);
process.exit(bad ? 1 : 0);
