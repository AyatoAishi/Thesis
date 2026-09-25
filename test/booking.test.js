// ============================================================================
// test/booking.test.js — the booking rules in lib/booking.js, which are pure
// and so can be checked without a database or a clock.
//
// The one worth reading closely is the slot-ending rule. A slot closes when it
// ENDS, not when it begins: at 10:30 the 10–11 slot is still happening, and a
// walk-in who arrived at 10:25 belongs in it. Closing it at 10:00 would push
// them into 11–12 and make the record lie about when they were seen.
// ============================================================================
const b = require("../lib/booking");

let bad = 0;
const check = (label, ok, extra = "") => {
  if (!ok) bad++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${extra ? "   " + extra : ""}`);
};

// ---- the slots themselves ---------------------------------------------------
check("eight slots, 8 to 5", b.SLOTS.length === 8);
check("no slot at lunch (12:00)", !b.slotFor("12:00"));
check("first slot 8–9", b.SLOTS[0].value === "08:00" && b.SLOTS[0].end === "09:00");
check("last slot 4–5", b.SLOTS[7].value === "16:00" && b.SLOTS[7].end === "17:00");
check("each slot is exactly one hour", b.SLOTS.every((s) => Number(s.end.slice(0, 2)) - Number(s.value.slice(0, 2)) === 1));

// ---- reading a time in any of the shapes it arrives in ---------------------
check("'09:00:00' from Postgres is the 9 o'clock slot", b.slotFor("09:00:00") && b.slotFor("09:00:00").value === "09:00");
check("'9:00' from a form is the same slot", b.slotFor("9:00") && b.slotFor("9:00").value === "09:00");
check("an off-grid time is not a slot", !b.slotFor("19:58"));
check("rubbish is not a slot", !b.slotFor("nope") && !b.slotFor(""));

// ---- has this slot ended? ---------------------------------------------------
const T = "2026-10-01";
check("at 10:30, 8–9 has ended", b.slotHasEnded(T, "08:00", T, "10:30"));
check("at 10:30, 9–10 has ended", b.slotHasEnded(T, "09:00", T, "10:30"));
check("at 10:30, 10–11 is still open", !b.slotHasEnded(T, "10:00", T, "10:30"));
check("at 10:00 exactly, 9–10 has ended", b.slotHasEnded(T, "09:00", T, "10:00"));
check("a future day is never ended", !b.slotHasEnded("2026-10-02", "08:00", T, "23:59"));

// ---- the dropdown ---------------------------------------------------------
check("a future day offers all eight", b.openSlots("2026-10-02", T, "15:00").length === 8);
check("a past day offers none", b.openSlots("2026-09-30", T, "08:00").length === 0);
check("today at 10:30 offers six", b.openSlots(T, T, "10:30").length === 6, b.openSlots(T, T, "10:30").map((s) => s.value).join(","));
check("today after 5 PM offers none", b.openSlots(T, T, "17:05").length === 0);

// ---- rules that need the patient --------------------------------------------
const prenatal = { name: "prenatal" };
const immun = { name: "immunization" };
check("male + prenatal refused", b.patientRules({ sex: "male" }, prenatal).length === 1);
check("male + immunization allowed", b.patientRules({ sex: "male" }, immun).length === 0);
check("female + prenatal allowed", b.patientRules({ sex: "female" }, prenatal).length === 0);
check("sex not recorded + prenatal allowed", b.patientRules({ sex: null }, prenatal).length === 0);
check("'Male' in any case is still male", b.patientRules({ sex: "MALE" }, prenatal).length === 1);
check("deceased refused for anything", b.patientRules({ deceased_at: "2026-09-01" }, immun).length === 1);
check("deceased male + prenatal gives both reasons", b.patientRules({ sex: "male", deceased_at: "2026-09-01" }, prenatal).length === 2);

// ---- labels ------------------------------------------------------------------
check("label for a slot", b.slotLabel("13:00") === "1:00 PM – 2:00 PM");
check("label for an old off-grid time falls back to the time", b.slotLabel("19:58:00") === "19:58");

console.log(bad ? `\n${bad} check(s) failed.` : "\nThe booking rules hold: eight slots, closed when they end, no prenatal for men, nothing for the deceased.");
process.exit(bad ? 1 : 0);
