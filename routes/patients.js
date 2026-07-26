// ============================================================================
// routes/patients.js — Patient records CRUD (M2)
// All routes already sit behind requireLogin (mounted after the gate in server.js).
// Patient numbers are auto-generated as SAMP-YYYY-#### (per-year sequence).
// Panel rule: a minor must have a guardian name + recorded guardian consent.
// ============================================================================
const express = require("express");
const db = require("../db");
const F = require("../lib/format");
const ID_TYPES = require("../lib/idTypes");

const router = express.Router();

// ---- helpers ---------------------------------------------------------------

// Next human-facing patient number for the current year, e.g. SAMP-2026-0007.
async function nextPatientNumber() {
  const year = new Date().getFullYear();
  const prefix = `SAMP-${year}-`;
  const { rows } = await db.query(
    `SELECT patient_number FROM patients
      WHERE patient_number LIKE $1
      ORDER BY patient_number DESC LIMIT 1`,
    [prefix + "%"]
  );
  let n = 1;
  if (rows[0]) {
    const tail = parseInt(rows[0].patient_number.split("-").pop(), 10);
    if (!Number.isNaN(tail)) n = tail + 1;
  }
  return prefix + String(n).padStart(4, "0");
}

// Pull + normalize the patient fields from a submitted form.
function readForm(body) {
  const isMinor = body.is_minor === "on" || body.is_minor === "true";
  return {
    full_name: (body.full_name || "").trim(),
    birthdate: body.birthdate || null,
    sex: body.sex || null,
    address: (body.address || "").trim() || null,
    contact_number: (body.contact_number || "").trim() || null,
    email: (body.email || "").trim().toLowerCase() || null,
    family_contact_name: (body.family_contact_name || "").trim() || null,
    family_contact_relation: (body.family_contact_relation || "").trim() || null,
    family_contact_number: (body.family_contact_number || "").trim() || null,
    family_email: (body.family_email || "").trim().toLowerCase() || null,
    is_minor: isMinor,
    guardian_name: (body.guardian_name || "").trim() || null,
    guardian_consent: body.guardian_consent === "on" || body.guardian_consent === "true",
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Shared validation. Returns an array of error strings (empty = valid).
function validate(p) {
  const errors = [];
  if (!p.full_name) errors.push("Full name is required.");
  if (p.email && !EMAIL_RE.test(p.email)) errors.push("Patient email is not a valid email address.");
  if (p.family_email && !EMAIL_RE.test(p.family_email)) errors.push("Family email is not a valid email address.");
  if (p.sex && !["male", "female"].includes(p.sex)) errors.push("Invalid sex.");
  // Panel requirement: minors need guardian + consent.
  if (p.is_minor) {
    if (!p.guardian_name) errors.push("Guardian name is required for a minor.");
    if (!p.guardian_consent)
      errors.push("Guardian consent must be recorded for a minor.");
  }
  // Must be reachable somehow (patient phone OR a family contact number).
  if (!p.contact_number && !p.family_contact_number)
    errors.push("Provide a contact number (patient or family contact).");
  return errors;
}

// ---- LIST  /patients  (with simple search) ---------------------------------
router.get("/patients", async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    let rows;
    if (q) {
      const like = `%${q}%`;
      ({ rows } = await db.query(
        `SELECT patient_id, patient_number, full_name, sex, birthdate,
                contact_number, is_minor
           FROM patients
          WHERE full_name ILIKE $1 OR patient_number ILIKE $1
                OR contact_number ILIKE $1
          ORDER BY created_at DESC LIMIT 200`,
        [like]
      ));
    } else {
      ({ rows } = await db.query(
        `SELECT patient_id, patient_number, full_name, sex, birthdate,
                contact_number, is_minor
           FROM patients ORDER BY created_at DESC LIMIT 200`
      ));
    }
    res.render("patients/list", {
      title: "Patients · Sampaguita HC",
      active: "patients",
      patients: rows,
      q,
    });
  } catch (e) {
    next(e);
  }
});

// ---- NEW form  /patients/new ----------------------------------------------
router.get("/patients/new", (req, res) => {
  res.render("patients/form", {
    title: "Add patient · Sampaguita HC",
    active: "patients",
    mode: "new",
    patient: {},
    errors: [],
  });
});

// ---- CREATE  POST /patients ------------------------------------------------
router.post("/patients", async (req, res, next) => {
  const p = readForm(req.body);
  const errors = validate(p);
  if (errors.length) {
    return res.status(400).render("patients/form", {
      title: "Add patient · Sampaguita HC",
      active: "patients",
      mode: "new",
      patient: p,
      errors,
    });
  }
  try {
    const patient_number = await nextPatientNumber();
    const { rows } = await db.query(
      `INSERT INTO patients
         (patient_number, full_name, birthdate, sex, address, contact_number, email,
          family_contact_name, family_contact_relation, family_contact_number, family_email,
          is_minor, guardian_name, guardian_consent, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING patient_id`,
      [
        patient_number, p.full_name, p.birthdate, p.sex, p.address,
        p.contact_number, p.email, p.family_contact_name, p.family_contact_relation,
        p.family_contact_number, p.family_email, p.is_minor, p.guardian_name,
        p.guardian_consent, req.session.user.user_id,
      ]
    );
    res.redirect(`/patients/${rows[0].patient_id}`);
  } catch (e) {
    next(e);
  }
});

// ---- VIEW  /patients/:id ---------------------------------------------------
router.get("/patients/:id", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT p.*, u.full_name AS created_by_name
         FROM patients p
         LEFT JOIN users u ON u.user_id = p.created_by
        WHERE p.patient_id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return next();

    const [appts, acctQ, dispensesQ] = await Promise.all([
      db.query(
        `SELECT a.appointment_id, a.appointment_date, a.appointment_time, a.status,
                s.name AS service_name
           FROM appointments a
           JOIN services s ON s.service_id = a.service_id
          WHERE a.patient_id = $1
          ORDER BY a.appointment_date DESC, a.appointment_time NULLS LAST
          LIMIT 50`,
        [req.params.id]
      ),
      db.query(
        `SELECT account_id, username, valid_id_type, valid_id_number, is_verified, created_at
           FROM patient_accounts WHERE patient_id = $1`,
        [req.params.id]
      ),
      db.query(
        `SELECT d.dispense_id, d.quantity, d.dispensed_at, d.requires_doctor_approval, d.approved_at,
                m.medicine_id, m.name AS medicine_name, m.unit
           FROM medicine_dispenses d
           JOIN medicines m ON m.medicine_id = d.medicine_id
          WHERE d.patient_id = $1
          ORDER BY d.dispensed_at DESC
          LIMIT 50`,
        [req.params.id]
      ),
    ]);

    // One-time credentials flash (set by portal-account create/reset) — read once, then gone.
    let secrets = null;
    if (req.session.oneTimeSecret &&
        req.session.oneTimeSecret.patient_id === rows[0].patient_id) {
      secrets = req.session.oneTimeSecret;
      delete req.session.oneTimeSecret;
    }

    res.render("patients/view", {
      title: `${rows[0].full_name} · Sampaguita HC`,
      active: "patients",
      patient: rows[0],
      appointments: appts.rows,
      dispenses: dispensesQ.rows,
      account: acctQ.rows[0] || null,
      secrets,
      acctErr: req.query.acct_err || null,
      idTypes: ID_TYPES,
      pretty: F.prettyService,
      shortTime: F.shortTime,
      longDate: F.longDate,
    });
  } catch (e) {
    next(e);
  }
});

// ---- EDIT form  /patients/:id/edit ----------------------------------------
router.get("/patients/:id/edit", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM patients WHERE patient_id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return next();
    res.render("patients/form", {
      title: "Edit patient · Sampaguita HC",
      active: "patients",
      mode: "edit",
      patient: rows[0],
      errors: [],
    });
  } catch (e) {
    next(e);
  }
});

// ---- UPDATE  POST /patients/:id -------------------------------------------
router.post("/patients/:id", async (req, res, next) => {
  const p = readForm(req.body);
  const errors = validate(p);
  if (errors.length) {
    return res.status(400).render("patients/form", {
      title: "Edit patient · Sampaguita HC",
      active: "patients",
      mode: "edit",
      patient: { ...p, patient_id: req.params.id },
      errors,
    });
  }
  try {
    const { rowCount } = await db.query(
      `UPDATE patients SET
         full_name=$1, birthdate=$2, sex=$3, address=$4, contact_number=$5, email=$6,
         family_contact_name=$7, family_contact_relation=$8, family_contact_number=$9,
         family_email=$10, is_minor=$11, guardian_name=$12, guardian_consent=$13, updated_at=now()
       WHERE patient_id=$14`,
      [
        p.full_name, p.birthdate, p.sex, p.address, p.contact_number, p.email,
        p.family_contact_name, p.family_contact_relation, p.family_contact_number,
        p.family_email, p.is_minor, p.guardian_name, p.guardian_consent, req.params.id,
      ]
    );
    if (!rowCount) return next();
    res.redirect(`/patients/${req.params.id}`);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
