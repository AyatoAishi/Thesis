// ============================================================================
// routes/visits.js — consultation records (vital signs, diagnosis, notes).
//
// Chapter 1 promises the system stores "recorded vital signs" and "diagnoses
// and consultation notes entered by the nurse". The `visits` table has held
// room for exactly that since M0, but nothing in the app ever wrote to it —
// appointments recorded that a visit HAPPENED, never what happened during it.
// This is that screen.
//
// Who may write: nurse, doctor, admin. A facilitator queues patients and a
// recorder handles paperwork; neither writes a clinical finding, and the panel
// asked for roles that actually mean something.
//
// What the patient sees: the portal shows the date, vital signs and diagnosis
// (routes/portal.js already reads them) but NOT consultation_notes. Those are
// the clinician's working notes — shorthand, differentials, things written to
// be read by the next clinician rather than by the patient.
// ============================================================================
const express = require("express");
const db = require("../db");
const F = require("../lib/format");
const audit = require("../lib/audit");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

const CLINICAL_ROLES = ["nurse", "doctor", "admin"];

// Ranges are wide on purpose — they exist to stop a slipped keystroke or a
// mis-typed field, not to second-guess a clinician. A prenatal record once
// reached this database carrying an expected delivery date in the year 7775.
const RANGES = {
  bp_systolic: [50, 300, "Systolic BP"],
  bp_diastolic: [30, 200, "Diastolic BP"],
  weight_kg: [0.5, 400, "Weight"],
  height_cm: [20, 250, "Height"],
  temperature_c: [30, 45, "Temperature"],
};

function readForm(body) {
  const num = (v) => {
    const s = (v || "").toString().trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;   // NaN = "they typed something odd"
  };
  return {
    visit_date: (body.visit_date || "").trim() || null,
    bp_systolic: num(body.bp_systolic),
    bp_diastolic: num(body.bp_diastolic),
    weight_kg: num(body.weight_kg),
    height_cm: num(body.height_cm),
    temperature_c: num(body.temperature_c),
    diagnosis: (body.diagnosis || "").trim() || null,
    consultation_notes: (body.consultation_notes || "").trim() || null,
    doctor_id: parseInt(body.doctor_id, 10) || null,
    appointment_id: parseInt(body.appointment_id, 10) || null,
  };
}

function validate(v) {
  const errors = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.visit_date || "")) errors.push("Choose the date of the visit.");
  else if (v.visit_date > F.manilaToday()) errors.push("The visit date can't be in the future.");

  Object.keys(RANGES).forEach((k) => {
    const [min, max, label] = RANGES[k];
    if (v[k] === null) return;
    if (Number.isNaN(v[k])) return errors.push(`${label} must be a number.`);
    if (v[k] < min || v[k] > max) errors.push(`${label} looks wrong — expected between ${min} and ${max}.`);
  });

  // Blood pressure is a pair; half of one is a record nobody can read later.
  const hasSys = v.bp_systolic !== null && !Number.isNaN(v.bp_systolic);
  const hasDia = v.bp_diastolic !== null && !Number.isNaN(v.bp_diastolic);
  if (hasSys !== hasDia) errors.push("Enter both blood pressure numbers, or leave both blank.");
  if (hasSys && hasDia && v.bp_systolic <= v.bp_diastolic)
    errors.push("Systolic BP should be higher than diastolic (e.g. 120/80).");

  // A row with a date and nothing else is not a consultation record.
  const anything = ["bp_systolic", "weight_kg", "height_cm", "temperature_c"].some(
    (k) => v[k] !== null
  ) || v.diagnosis || v.consultation_notes;
  if (!anything) errors.push("Record at least one vital sign, a diagnosis, or a note.");

  return errors;
}

async function loadDoctors() {
  const { rows } = await db.query(
    "SELECT user_id, full_name FROM users WHERE role='doctor' AND status='active' ORDER BY full_name"
  );
  return rows;
}

async function loadPatient(id) {
  const { rows } = await db.query(
    "SELECT patient_id, patient_number, full_name FROM patients WHERE patient_id = $1",
    [id]
  );
  return rows[0] || null;
}

// Appointments this visit can be attached to. Optional — walk-ins are the norm
// at a barangay clinic, so a consultation must be recordable without one.
async function loadAppointments(patientId) {
  const { rows } = await db.query(
    `SELECT a.appointment_id, a.appointment_date, a.status, s.name AS service_name
       FROM appointments a JOIN services s ON s.service_id = a.service_id
      WHERE a.patient_id = $1 AND a.appointment_date <= $2
      ORDER BY a.appointment_date DESC
      LIMIT 20`,
    [patientId, F.manilaToday()]
  );
  return rows;
}

// ---- NEW  GET /patients/:id/visits/new ---------------------------------------
router.get("/patients/:id/visits/new", requireRole(...CLINICAL_ROLES), async (req, res, next) => {
  try {
    const patient = await loadPatient(req.params.id);
    if (!patient) return next();
    res.render("visits/form", {
      title: `Record consultation — ${patient.full_name} · Sampaguita HC`,
      active: "patients",
      mode: "new",
      patient,
      visit: {
        visit_date: F.manilaToday(),
        appointment_id: parseInt(req.query.appointment_id, 10) || null,
      },
      doctors: await loadDoctors(),
      appointments: await loadAppointments(patient.patient_id),
      errors: [],
      longDate: F.longDate,
      pretty: F.prettyService,
    });
  } catch (e) {
    next(e);
  }
});

// ---- CREATE  POST /patients/:id/visits ---------------------------------------
router.post("/patients/:id/visits", requireRole(...CLINICAL_ROLES), async (req, res, next) => {
  try {
    const patient = await loadPatient(req.params.id);
    if (!patient) return next();

    const v = readForm(req.body);
    const errors = validate(v);
    if (errors.length) {
      return res.status(400).render("visits/form", {
        title: `Record consultation — ${patient.full_name} · Sampaguita HC`,
        active: "patients",
        mode: "new",
        patient,
        visit: v,
        doctors: await loadDoctors(),
        appointments: await loadAppointments(patient.patient_id),
        errors,
        longDate: F.longDate,
        pretty: F.prettyService,
      });
    }

    const { rows } = await db.query(
      `INSERT INTO visits
         (patient_id, appointment_id, visit_date, bp_systolic, bp_diastolic,
          weight_kg, height_cm, temperature_c, diagnosis, consultation_notes,
          attended_by, doctor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING visit_id`,
      [
        patient.patient_id, v.appointment_id, v.visit_date, v.bp_systolic, v.bp_diastolic,
        v.weight_kg, v.height_cm, v.temperature_c, v.diagnosis, v.consultation_notes,
        req.session.user.user_id, v.doctor_id,
      ]
    );

    audit.log(
      req.session.user.user_id, "create", "visit", rows[0].visit_id,
      `consultation for ${patient.full_name} on ${v.visit_date}`
    );
    res.redirect(`/patients/${patient.patient_id}`);
  } catch (e) {
    next(e);
  }
});

// ---- EDIT  GET /visits/:id/edit ----------------------------------------------
// Correcting a mistyped vital sign has to be possible; the audit log records
// that it happened, which is the honest version of "editable".
router.get("/visits/:id/edit", requireRole(...CLINICAL_ROLES), async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT * FROM visits WHERE visit_id = $1", [req.params.id]);
    if (!rows[0]) return next();
    const patient = await loadPatient(rows[0].patient_id);
    res.render("visits/form", {
      title: `Edit consultation — ${patient.full_name} · Sampaguita HC`,
      active: "patients",
      mode: "edit",
      patient,
      visit: rows[0],
      doctors: await loadDoctors(),
      appointments: await loadAppointments(patient.patient_id),
      errors: [],
      longDate: F.longDate,
      pretty: F.prettyService,
    });
  } catch (e) {
    next(e);
  }
});

// ---- UPDATE  POST /visits/:id ------------------------------------------------
router.post("/visits/:id", requireRole(...CLINICAL_ROLES), async (req, res, next) => {
  try {
    const existing = await db.query(
      "SELECT visit_id, patient_id FROM visits WHERE visit_id = $1", [req.params.id]
    );
    if (!existing.rows[0]) return next();
    const patient = await loadPatient(existing.rows[0].patient_id);

    const v = readForm(req.body);
    const errors = validate(v);
    if (errors.length) {
      return res.status(400).render("visits/form", {
        title: `Edit consultation — ${patient.full_name} · Sampaguita HC`,
        active: "patients",
        mode: "edit",
        patient,
        visit: { ...v, visit_id: req.params.id },
        doctors: await loadDoctors(),
        appointments: await loadAppointments(patient.patient_id),
        errors,
        longDate: F.longDate,
        pretty: F.prettyService,
      });
    }

    await db.query(
      `UPDATE visits SET
         appointment_id=$1, visit_date=$2, bp_systolic=$3, bp_diastolic=$4,
         weight_kg=$5, height_cm=$6, temperature_c=$7, diagnosis=$8,
         consultation_notes=$9, doctor_id=$10
       WHERE visit_id=$11`,
      [
        v.appointment_id, v.visit_date, v.bp_systolic, v.bp_diastolic,
        v.weight_kg, v.height_cm, v.temperature_c, v.diagnosis,
        v.consultation_notes, v.doctor_id, req.params.id,
      ]
    );

    audit.log(
      req.session.user.user_id, "update", "visit", req.params.id,
      `consultation for ${patient.full_name} on ${v.visit_date}`
    );
    res.redirect(`/patients/${patient.patient_id}`);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
