// ============================================================================
// lib/booking.js — the rules an appointment has to pass, in one testable place.
//
// From the professors' review, 2026-09-25:
//   - "Add a list of time when booking an appointment, 8:00 am – 9:00 am,
//     9:00 am – 10:00 am, and so on."  Clinic hours are 8 to 5 with lunch from
//     12 to 1, so eight one-hour slots. A free time box had let the live
//     database fill with 00:10, 03:01 and 19:58 appointments.
//   - "If lagpas na sa time … its already 10am, and you wanna put an
//     appointment 8am that day, di na dapat pwede."
//   - "If the patient is male, there should be no way, in any way, they can
//     set an appointment for a prenatal."
//   - "Add a 'Mark as deceased'" — and a person who has died is not booked.
//
// When is a slot too late? When it has ENDED, not when it has started. At
// 10:30 the 8–9 and 9–10 slots are gone, but 10–11 is still happening and a
// walk-in who arrived at 10:25 belongs in it. Closing a slot the moment it
// begins would force that person into 11–12 and make the record lie about when
// they were seen.
// ============================================================================

const SLOTS = [
  { value: "08:00", end: "09:00", label: "8:00 AM – 9:00 AM" },
  { value: "09:00", end: "10:00", label: "9:00 AM – 10:00 AM" },
  { value: "10:00", end: "11:00", label: "10:00 AM – 11:00 AM" },
  { value: "11:00", end: "12:00", label: "11:00 AM – 12:00 PM" },
  // 12:00 – 1:00 is lunch; no slot.
  { value: "13:00", end: "14:00", label: "1:00 PM – 2:00 PM" },
  { value: "14:00", end: "15:00", label: "2:00 PM – 3:00 PM" },
  { value: "15:00", end: "16:00", label: "3:00 PM – 4:00 PM" },
  { value: "16:00", end: "17:00", label: "4:00 PM – 5:00 PM" },
];

// "09:00", "09:00:00" and "9:00" all mean the same slot; Postgres hands back
// the seconds, forms send without them.
function toHHMM(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || "").trim());
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

const slotFor = (t) => SLOTS.find((s) => s.value === toHHMM(t)) || null;
const slotLabel = (t) => {
  const s = slotFor(t);
  if (s) return s.label;
  const hhmm = toHHMM(t);
  return hhmm || "—";
};

// Manila wall-clock time as "HH:MM", whatever timezone the server runs in.
function manilaNowHHMM(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const h = parts.find((p) => p.type === "hour").value;
  const m = parts.find((p) => p.type === "minute").value;
  return `${h}:${m}`;
}

// Is this slot over on this date? Past dates are handled separately (they are
// refused outright); this is about TODAY.
function slotHasEnded(date, time, todayISO, nowHHMM) {
  if (date !== todayISO) return false;
  const s = slotFor(time);
  if (!s) return false;
  return s.end <= nowHHMM;
}

// Slots still bookable on a date, for the dropdown. Every slot for a future
// day; only the ones that have not ended for today; none for a past day.
function openSlots(date, todayISO, nowHHMM) {
  if (!date || date < todayISO) return [];
  if (date > todayISO) return SLOTS.slice();
  return SLOTS.filter((s) => s.end > nowHHMM);
}

// The checks that need the patient. `patient` is { sex, deceased_at } — the
// caller loads it, so this stays free of the database and easy to test.
function patientRules(patient, service) {
  const errors = [];
  if (!patient) return errors;
  if (patient.deceased_at) {
    errors.push("This patient is marked as deceased. No new appointments can be booked for them.");
  }
  if (service && service.name === "prenatal" && String(patient.sex || "").toLowerCase() === "male") {
    errors.push("Prenatal checkups cannot be booked for a male patient.");
  }
  return errors;
}

module.exports = {
  SLOTS, toHHMM, slotFor, slotLabel, manilaNowHHMM, slotHasEnded, openSlots, patientRules,
};
