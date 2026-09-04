// ============================================================================
// services/immunizationSchedule.js — books the next immunization dose, and
// closes the book on the ones that were missed.
//
// The immunization card (lib/immunizationCard.js) already knows the date each
// dose comes due, because the DOH schedule is expressed as an age and every
// child has a birthday. What was missing was anything that acted on it: staff
// had to notice, in their heads, that a baby seen in August was owed a shot in
// September. This turns that into two passes that run once a day.
//
//   sweepMissed()  — a scheduled dose whose session day has passed without the
//                    dose being given becomes 'missed', and its appointment
//                    with it. Nothing else in this app ever marked an
//                    appointment missed; a no-show simply sat as 'scheduled'
//                    forever, which is why the no-shows report only ever
//                    listed the two rows the demo seeder wrote by hand.
//
//   autoSchedule() — every dose coming due inside the horizon gets booked into
//                    the next immunization session, as a real appointment on
//                    the Tuesday list plus a 'scheduled' immunization_record.
//                    A real appointment, and not a private to-do list, because
//                    the reminder engine, the daily schedule and the no-show
//                    report are all already built on appointments — booking it
//                    anywhere else would mean rebuilding all three.
//
//   Reminders      — not here. services/reminders.js already emails every
//                    scheduled appointment the day before, so a dose booked by
//                    autoSchedule() is reminded about by machinery that already
//                    exists. There is no second notification path to keep in
//                    sync with the first.
//
// Deliberately limited to the infant series. See lib/vaccines.js: a Grade 1
// dose is due on enrolment, not on a birthday, and the senior influenza shot is
// annual. Those keep being recorded by hand.
//
// CLI:  node services/immunizationSchedule.js [YYYY-MM-DD] [--dry]
//       --dry reports exactly what the run would do and writes nothing.
// ============================================================================
const db = require("../db");
const F = require("../lib/format");
const VACCINES = require("../lib/vaccines");
const audit = require("../lib/audit");

// How far ahead to book. A fortnight and a bit is long enough that the parent
// gets the reminder with time to arrange the trip, and short enough that the
// Tuesday list is not clogged with babies expected in November.
const HORIZON_DAYS = 21;

// Who this runs for at all. Same bound as the card (lib/immunizationCard.js):
// the infant series belongs to the DOH programme for under-fives, and without
// this the CROSS JOIN below books every adult in the barangay for BCG.
const EPI_MAX_AGE_YEARS = 5;

// A dose this far past due is a catch-up decision, not a scheduling one. It
// stays visible as overdue on the child's card and on their profile, and a
// person books it — rather than the machine dropping fifteen backdated doses
// onto one Tuesday morning for a four-year-old who has never been seen here.
const CATCHUP_LIMIT_DAYS = 90;

// The catalog, flattened to one row per dose: this vaccine, this dose, due at
// this age in weeks.
const DUE = [];
VACCINES.filter((v) => v.dueWeeks).forEach((v) => {
  v.dueWeeks.forEach((weeks, i) => DUE.push({ vaccine: v.name, dose: i + 1, weeks }));
});

// The next immunization session on or after `dateStr`. Sessions run one day a
// week (services.schedule_day) — booking a baby for the Thursday when the
// vaccine cooler only comes out on Tuesday is a date nobody can keep.
function nextSessionOnOrAfter(dateStr, weekdayName) {
  if (!weekdayName) return dateStr;
  const want = F.DAYS.indexOf(weekdayName);
  if (want < 0) return dateStr;
  for (let i = 0; i < 7; i++) {
    const d = F.addDays(dateStr, i);
    if (F.weekdayOf(d) === want) return d;
  }
  return dateStr;
}

async function immunizationService() {
  const { rows } = await db.query(
    "SELECT service_id, name, schedule_day FROM services WHERE name = 'immunization'"
  );
  return rows[0] || null;
}

// ---- PASS 1: what did not happen -------------------------------------------
// Runs before the booking pass, so a dose missed this morning is not still
// counted as booked when we decide whether to book it again.
async function sweepMissed(today, { dryRun = false } = {}) {
  const asOf = today || F.manilaToday();
  if (dryRun) {
    const doses = await db.query(
      `SELECT imm_id, patient_id, vaccine_name, dose_number, scheduled_date
         FROM immunization_records
        WHERE status='scheduled' AND scheduled_date < $1::date AND given_date IS NULL`,
      [asOf]
    );
    const appts = await db.query(
      `SELECT appointment_id, patient_id, appointment_date FROM appointments
        WHERE status='scheduled' AND appointment_date < $1::date`,
      [asOf]
    );
    return { dryRun: true, doses: doses.rowCount, appointments: appts.rowCount,
             wouldMiss: doses.rows, wouldMissAppointments: appts.rows };
  }

  const doses = await db.query(
    `UPDATE immunization_records
        SET status = 'missed'
      WHERE status = 'scheduled'
        AND scheduled_date < $1::date
        AND given_date IS NULL
      RETURNING imm_id, patient_id, vaccine_name, dose_number, scheduled_date`,
    [asOf]
  );

  // The appointments behind those doses, and every other appointment whose day
  // has been and gone. Cancelled ones are left alone: somebody said in advance
  // that it would not happen, which is not the same as not turning up.
  const appts = await db.query(
    `UPDATE appointments
        SET status = 'missed', updated_at = now()
      WHERE status = 'scheduled'
        AND appointment_date < $1::date
      RETURNING appointment_id, patient_id, appointment_date`,
    [asOf]
  );

  for (const d of doses.rows) {
    await audit.log(null, "update", "immunization", d.patient_id,
      `${d.vaccine_name} dose ${d.dose_number} missed (was due ${String(d.scheduled_date).slice(0, 10)})`);
  }

  return { doses: doses.rowCount, appointments: appts.rowCount };
}

// ---- PASS 2: what is coming -------------------------------------------------
async function autoSchedule({ today, horizonDays = HORIZON_DAYS, dryRun = false } = {}) {
  const asOf = today || F.manilaToday();
  const until = F.addDays(asOf, horizonDays);
  const service = await immunizationService();
  if (!service) {
    return { booked: 0, patients: 0, reason: "No immunization service is configured." };
  }

  // Every dose that is due (or already late) on or before the horizon and has
  // no record of any kind yet. "No record of any kind" is the load-bearing
  // part: a dose already given, already booked, or already marked missed must
  // not be booked again, or every run would pile another appointment onto the
  // same child.
  const { rows } = await db.query(
    `WITH due(vaccine_name, dose_number, weeks) AS (
       SELECT * FROM unnest($1::text[], $2::int[], $3::int[])
     )
     SELECT p.patient_id, p.full_name, p.birthdate,
            due.vaccine_name, due.dose_number,
            (p.birthdate + due.weeks * 7)::date AS due_date
       FROM patients p
       CROSS JOIN due
       LEFT JOIN immunization_records r
              ON r.patient_id = p.patient_id
             AND lower(r.vaccine_name) = lower(due.vaccine_name)
             AND r.dose_number = due.dose_number
      WHERE p.birthdate IS NOT NULL
        AND r.imm_id IS NULL
        AND p.birthdate > ($4::date - make_interval(years => $6::int))
        AND (p.birthdate + due.weeks * 7) <= $5::date
        AND (p.birthdate + due.weeks * 7) >= ($4::date - $7::int)
      ORDER BY p.patient_id, due_date, due.vaccine_name`,
    [DUE.map((d) => d.vaccine), DUE.map((d) => d.dose), DUE.map((d) => d.weeks),
     asOf, until, EPI_MAX_AGE_YEARS, CATCHUP_LIMIT_DAYS]
  );

  const patients = new Set();
  let booked = 0;

  // One appointment per patient per session date, however many doses fall on
  // it. A baby due for Pentavalent, OPV and PCV on the same Tuesday makes one
  // trip, and their parent should get one reminder, not three.
  const byPatientAndDate = new Map();
  for (const r of rows) {
    const dueDate = String(r.due_date).slice(0, 10);
    // A dose already past due is booked into the very next session, not its
    // original date — the point is to get the child in, not to record a
    // booking on a Tuesday that has already gone.
    const start = dueDate < asOf ? asOf : dueDate;
    const sessionDate = nextSessionOnOrAfter(start, service.schedule_day);
    const key = `${r.patient_id}|${sessionDate}`;
    if (!byPatientAndDate.has(key)) {
      byPatientAndDate.set(key, {
        patient_id: r.patient_id, full_name: r.full_name, sessionDate, doses: [],
      });
    }
    byPatientAndDate.get(key).doses.push({ vaccine: r.vaccine_name, dose: r.dose_number, dueDate });
  }

  if (dryRun) {
    return {
      dryRun: true, horizonDays, until, sessionDay: service.schedule_day,
      booked: rows.length, patients: byPatientAndDate.size,
      wouldBook: [...byPatientAndDate.values()],
    };
  }

  for (const group of byPatientAndDate.values()) {
    // Somebody at the desk may already have booked this child in for that day.
    // Reuse it rather than making a second one they would have to cancel.
    const existing = await db.query(
      `SELECT appointment_id FROM appointments
        WHERE patient_id = $1 AND service_id = $2 AND appointment_date = $3::date
          AND status IN ('scheduled','completed')
        LIMIT 1`,
      [group.patient_id, service.service_id, group.sessionDate]
    );

    let appointmentId = existing.rows[0] ? existing.rows[0].appointment_id : null;
    const note = `Automatic: ${group.doses.map((d) => `${d.vaccine} dose ${d.dose}`).join(", ")}`;
    if (!appointmentId) {
      const ins = await db.query(
        `INSERT INTO appointments (patient_id, service_id, appointment_date, status, notes, created_by)
         VALUES ($1,$2,$3::date,'scheduled',$4,NULL)
         RETURNING appointment_id`,
        [group.patient_id, service.service_id, group.sessionDate, note.slice(0, 255)]
      );
      appointmentId = ins.rows[0].appointment_id;
    }

    for (const d of group.doses) {
      // This table has no unique key to lean on, so the guard is the
      // conditional insert itself: another run (or the other server, if the
      // in-process cron and the external ping overlap) that got here first
      // leaves a row behind, and this one writes nothing.
      const r = await db.query(
        `INSERT INTO immunization_records
           (patient_id, vaccine_name, dose_number, scheduled_date, status, remarks)
         SELECT $1::int,$2::text,$3::int,$4::date,'scheduled',$5::text
          WHERE NOT EXISTS (
            SELECT 1 FROM immunization_records
             WHERE patient_id=$1::int
               AND lower(vaccine_name)=lower($2::text)
               AND dose_number=$3::int
          )
         RETURNING imm_id`,
        [group.patient_id, d.vaccine, d.dose, group.sessionDate,
         `Automatically scheduled — due ${d.dueDate}`]
      );
      if (r.rowCount) {
        booked++;
        patients.add(group.patient_id);
        await audit.log(null, "create", "immunization", group.patient_id,
          `auto-scheduled ${d.vaccine} dose ${d.dose} for ${group.sessionDate} (due ${d.dueDate})`);
      }
    }
  }

  return { booked, patients: patients.size, horizonDays, until, sessionDay: service.schedule_day };
}

// The whole daily pass, in the order the two halves depend on.
async function runDaily(today, { dryRun = false } = {}) {
  const asOf = today || F.manilaToday();
  const missed = await sweepMissed(asOf, { dryRun });
  const scheduled = await autoSchedule({ today: asOf, dryRun });
  return { date: asOf, dryRun, missed, scheduled };
}

module.exports = {
  sweepMissed, autoSchedule, runDaily, nextSessionOnOrAfter,
  HORIZON_DAYS, EPI_MAX_AGE_YEARS, CATCHUP_LIMIT_DAYS, DUE,
};

// ---- CLI -------------------------------------------------------------------
if (require.main === module) {
  require("dotenv").config();
  const dryRun = process.argv.includes("--dry");
  const day = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  runDaily(day, { dryRun })
    .then((s) => { console.log("Immunization pass:", JSON.stringify(s, null, 2)); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
