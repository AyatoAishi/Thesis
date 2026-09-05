// ============================================================================
// lib/immunizationCard.js — cross-references the standard DOH schedule in
// lib/vaccines.js against the doses actually recorded for one patient, and
// works out which of the empty slots are merely upcoming and which are late.
//
// Lives here rather than in routes/immunization.js because the patient portal
// renders the same card read-only, the profile page shows an overdue summary
// built from it, and services/immunizationSchedule.js books appointments off
// it — one source of truth for "which doses does this person have, which are
// still empty, and when was each one supposed to happen".
// ============================================================================
const db = require("../db");
const F = require("./format");
const VACCINES = require("./vaccines");

// A dose is late the day after it comes due. There is no grace period here on
// purpose: the DOH schedule already has catch-up built into it, and a card that
// waits a fortnight before admitting a child is behind is a card that lets the
// child fall a fortnight further behind first.
const OVERDUE_AFTER_DAYS = 0;

// ...and it stops being late at all once the child ages out of the programme.
// The infant series is the DOH's Expanded Programme on Immunization, whose
// target is 0–23 months with catch-up to five years. Past that the empty
// slots on the card are history, not a task: telling the desk that a
// 64-year-old is 23,000 days overdue for BCG buries the three babies who
// genuinely are behind, and every adult in the barangay would carry the
// same fifteen red rows.
const EPI_MAX_AGE_YEARS = 5;

function withinEpiAge(birthdate, today) {
  if (!birthdate) return false;
  const bd = String(birthdate).slice(0, 10);
  const [y, m, d] = bd.split("-");
  const cutoff = `${Number(y) + EPI_MAX_AGE_YEARS}-${m}-${d}`;
  return today < cutoff;
}

function dueDateFor(birthdate, weeks) {
  if (!birthdate || !Number.isFinite(weeks)) return null;
  return F.addDays(String(birthdate).slice(0, 10), weeks * 7);
}

function daysBetween(fromDate, toDate) {
  const a = Date.UTC(...fromDate.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  const b = Date.UTC(...toDate.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.round((b - a) / 86400000);
}

// Returns { schedule, other, overdue, upcoming }:
//   schedule — every catalog vaccine with a doseSlots array. Each slot is
//              given, or has a state of 'overdue' / 'due' / 'upcoming' /
//              'unscheduled' (the school and senior rows, which have no
//              birthday-derived due date — see lib/vaccines.js).
//   other    — recorded doses whose vaccine isn't on the catalog at all
//              (vaccine_name is free text, which is what makes "Other" work)
//   overdue  — the late slots, flattened and sorted worst-first, for the
//              profile page and the alert bell
//   upcoming — the not-yet-due slots, soonest first, for "when do they return"
async function buildCard(patientId, birthdate) {
  // The caller usually has the patient row already; look it up only if not.
  if (birthdate === undefined) {
    const { rows } = await db.query("SELECT birthdate FROM patients WHERE patient_id=$1", [patientId]);
    birthdate = rows[0] ? rows[0].birthdate : null;
  }

  const { rows } = await db.query(
    `SELECT imm_id, vaccine_name, dose_number, given_date, scheduled_date, status, remarks
       FROM immunization_records
      WHERE patient_id=$1
      ORDER BY given_date NULLS LAST, scheduled_date`,
    [patientId]
  );

  const given = rows.filter((r) => r.status === "given");
  const byVaccine = new Map();
  given.forEach((r) => {
    if (!byVaccine.has(r.vaccine_name)) byVaccine.set(r.vaccine_name, new Map());
    byVaccine.get(r.vaccine_name).set(r.dose_number, r);
  });

  // Doses already booked into a session — an empty slot with a date attached is
  // not the same thing as an empty slot nobody has done anything about.
  const booked = new Map();
  rows
    .filter((r) => r.status === "scheduled")
    .forEach((r) => {
      if (!booked.has(r.vaccine_name)) booked.set(r.vaccine_name, new Map());
      booked.get(r.vaccine_name).set(r.dose_number, r);
    });

  const today = F.manilaToday();
  const inProgramme = withinEpiAge(birthdate, today);
  const overdue = [];
  const upcoming = [];

  const catalogNames = new Set(VACCINES.map((v) => v.name));
  const schedule = VACCINES.map((v) => ({
    ...v,
    doseSlots: Array.from({ length: v.doses }, (_, i) => {
      const doseNumber = i + 1;
      const rec = byVaccine.get(v.name)?.get(doseNumber);
      if (rec) {
        return { doseNumber, given: true, date: rec.given_date, remarks: rec.remarks, imm_id: rec.imm_id };
      }

      const weeks = v.dueWeeks ? v.dueWeeks[i] : undefined;
      const dueDate = dueDateFor(birthdate, weeks);
      const bookedRec = booked.get(v.name)?.get(doseNumber) || null;
      const slot = {
        doseNumber,
        given: false,
        dueDate,
        bookedFor: bookedRec ? String(bookedRec.scheduled_date).slice(0, 10) : null,
        vaccine: v.name,
        state: "unscheduled",
        daysOverdue: 0,
      };

      if (dueDate && inProgramme) {
        const lateBy = daysBetween(dueDate, today);
        if (lateBy > OVERDUE_AFTER_DAYS) {
          slot.state = "overdue";
          slot.daysOverdue = lateBy;
          overdue.push(slot);
        } else if (lateBy >= 0) {
          slot.state = "due";
          upcoming.push(slot);
        } else {
          slot.state = "upcoming";
          slot.daysUntil = -lateBy;
          upcoming.push(slot);
        }
      }
      return slot;
    }),
  }));

  overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
  upcoming.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));

  const other = given.filter((r) => !catalogNames.has(r.vaccine_name));

  return { schedule, other, overdue, upcoming };
}

// The one number the patient list and the alert bell need, for many patients at
// once. Doing it by calling buildCard() per patient would be one query per row.
// This computes the same thing in SQL: for every dose in the infant series,
// what date does this child's birthday put it on, and is that date past?
//
// Kept beside buildCard() so the two can never drift on what "overdue" means.
// The catalog flattened to one row per dose — name, dose number, age in
// weeks — in the three parallel arrays a Postgres unnest() wants. Exported
// because server.js folds the same question into the topbar's single query
// rather than paying for a second one on every authenticated request.
const DUE_ARRAYS = (() => {
  const names = [], doses = [], weeks = [];
  VACCINES.filter((v) => v.dueWeeks).forEach((v) => {
    v.dueWeeks.forEach((w, i) => { names.push(v.name); doses.push(i + 1); weeks.push(w); });
  });
  return { names, doses, weeks };
})();

// Children with at least one dose past due, as a scalar subquery to be
// dropped into a bigger SELECT. The $ placeholders it uses are supplied by
// the caller, which is why they are arguments rather than literals.
function overdueChildrenSql({ names, doses, weeks, today, maxAge }) {
  return `(SELECT count(DISTINCT p.patient_id)::int
             FROM patients p
             CROSS JOIN unnest(${names}::text[], ${doses}::int[], ${weeks}::int[])
                     AS due(vaccine_name, dose_number, weeks)
             LEFT JOIN immunization_records r
                    ON r.patient_id = p.patient_id
                   AND lower(r.vaccine_name) = lower(due.vaccine_name)
                   AND r.dose_number = due.dose_number
                   AND r.status = 'given'
            WHERE p.birthdate IS NOT NULL
              AND r.imm_id IS NULL
              AND p.birthdate > (${today}::date - make_interval(years => ${maxAge}::int))
              AND (p.birthdate + due.weeks * 7) < ${today}::date)`;
}

// `patientIds` may be null, meaning "every patient still inside the programme".
//
// That option exists for speed, not for tidiness. Passing the ids means waiting
// for the patient list to come back before this can even start, so the two
// queries ran nose to tail — and on this deployment a round trip to the
// database is worth far more than the query itself. With null they run
// together, and since the GROUP BY only ever returns patients who ARE overdue,
// and only those under five, the result stays small: a superset of what the
// page needs, looked up by id, so the extra rows cost nothing.
async function overdueCounts(patientIds, today) {
  const all = patientIds === null;
  const ids = all ? [] : (patientIds || []).map(Number).filter(Number.isInteger);
  if (!all && !ids.length) return new Map();
  const asOf = today || F.manilaToday();

  const dueRows = [];
  VACCINES.filter((v) => v.dueWeeks).forEach((v) => {
    v.dueWeeks.forEach((weeks, i) => dueRows.push({ name: v.name, dose: i + 1, weeks }));
  });

  const { rows } = await db.query(
    `WITH due(vaccine_name, dose_number, weeks) AS (
       SELECT * FROM unnest($2::text[], $3::int[], $4::int[])
     )
     SELECT p.patient_id,
            count(*)::int AS overdue,
            max(($5::date - (p.birthdate + due.weeks * 7)))::int AS worst_days
       FROM patients p
       CROSS JOIN due
       LEFT JOIN immunization_records r
              ON r.patient_id = p.patient_id
             AND lower(r.vaccine_name) = lower(due.vaccine_name)
             AND r.dose_number = due.dose_number
             AND r.status = 'given'
      WHERE ($1::int[] IS NULL OR p.patient_id = ANY($1::int[]))
        AND p.birthdate IS NOT NULL
        AND p.birthdate > ($5::date - make_interval(years => $6::int))
        AND r.imm_id IS NULL
        AND (p.birthdate + due.weeks * 7) < $5::date
      GROUP BY p.patient_id`,
    [all ? null : ids, dueRows.map((d) => d.name), dueRows.map((d) => d.dose),
     dueRows.map((d) => d.weeks), asOf, EPI_MAX_AGE_YEARS]
  );

  return new Map(rows.map((r) => [r.patient_id, { overdue: r.overdue, worstDays: r.worst_days }]));
}

module.exports = {
  buildCard, overdueCounts, overdueChildrenSql, DUE_ARRAYS,
  dueDateFor, daysBetween, withinEpiAge,
  OVERDUE_AFTER_DAYS, EPI_MAX_AGE_YEARS,
};
