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
const audit = require("../lib/audit");
const { requireRole } = require("../middleware/auth");

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

// Next household/family number for the current year, e.g. 26-00, 26-01…
// (teammate spec: 2-digit year, sequence starting at 00 — separate scheme
// from patient_number since one family groups several patients). Only rows
// that already match the YY-N pattern count toward the sequence, so old
// free-text values entered before this existed don't break the count.
async function nextFamilyNumber() {
  const yy = String(new Date().getFullYear()).slice(-2);
  const { rows } = await db.query(
    `SELECT max(split_part(family_number, '-', 2)::int) AS max_seq
       FROM patients
      WHERE family_number ~ '^\\d{2}-\\d+$' AND split_part(family_number, '-', 1) = $1`,
    [yy]
  );
  const n = rows[0].max_seq === null ? 0 : rows[0].max_seq + 1;
  return `${yy}-${String(n).padStart(2, "0")}`;
}

// Patients for the "link to existing family member" search on the form —
// staff search by a name they actually know, instead of needing to remember
// or copy-paste a household number.
async function loadFamilyLookup(excludeId) {
  const { rows } = await db.query(
    excludeId
      ? `SELECT patient_id, patient_number, full_name, family_number FROM patients
          WHERE patient_id <> $1 ORDER BY full_name LIMIT 500`
      : `SELECT patient_id, patient_number, full_name, family_number FROM patients
          ORDER BY full_name LIMIT 500`,
    excludeId ? [excludeId] : []
  );
  return rows;
}

// Other patients sharing a family number, for a friendly "linked with
// Name, Name" display instead of ever showing the raw code to staff.
async function loadFamilyMembers(family_number, excludeId) {
  if (!family_number) return [];
  const { rows } = await db.query(
    "SELECT patient_id, full_name, patient_number FROM patients WHERE family_number=$1 AND patient_id<>$2 ORDER BY full_name",
    [family_number, excludeId || 0]
  );
  return rows;
}

// Minor status is never taken from the client — always derived from birthdate
// (professor's revision note: "auto-calculate from birthdate").
function calcIsMinor(birthdate) {
  if (!birthdate) return false;
  const bd = new Date(birthdate);
  if (Number.isNaN(bd.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age < 18;
}

// Pull + normalize the patient fields from a submitted form.
function readForm(body) {
  const birthdate = body.birthdate || null;
  return {
    full_name: (body.full_name || "").trim(),
    birthdate,
    sex: body.sex || null,
    address: (body.address || "").trim() || null,
    contact_number: (body.contact_number || "").trim() || null,
    email: (body.email || "").trim().toLowerCase() || null,
    family_number: (body.family_number || "").trim() || null,
    family_contact_name: (body.family_contact_name || "").trim() || null,
    family_contact_relation: (body.family_contact_relation || "").trim() || null,
    family_contact_number: (body.family_contact_number || "").trim() || null,
    family_email: (body.family_email || "").trim().toLowerCase() || null,
    is_minor: calcIsMinor(birthdate),
    guardian_name: (body.guardian_name || "").trim() || null,
    guardian_consent: body.guardian_consent === "on" || body.guardian_consent === "true",
    privacy_consent: body.privacy_consent === "on" || body.privacy_consent === "true",
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
  } else {
    // Only the head of household needs a reachable contact number (panel note) —
    // minors can be registered under a family/household number instead.
    if (!p.contact_number && !p.family_contact_number)
      errors.push("Provide a contact number (patient or family contact).");
  }
  if (!p.privacy_consent) errors.push("Data privacy consent must be recorded.");
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
router.get("/patients/new", async (req, res, next) => {
  try {
    res.render("patients/form", {
      title: "Add patient · Sampaguita HC",
      active: "patients",
      mode: "new",
      patient: {},
      familyLookup: await loadFamilyLookup(),
      familyMembers: [],
      errors: [],
    });
  } catch (e) {
    next(e);
  }
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
      familyLookup: await loadFamilyLookup(),
      familyMembers: await loadFamilyMembers(p.family_number),
      errors,
    });
  }
  try {
    const patient_number = await nextPatientNumber();
    const { rows } = await db.query(
      `INSERT INTO patients
         (patient_number, full_name, birthdate, sex, address, contact_number, email,
          family_number, family_contact_name, family_contact_relation, family_contact_number, family_email,
          is_minor, guardian_name, guardian_consent, privacy_consent, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING patient_id`,
      [
        patient_number, p.full_name, p.birthdate, p.sex, p.address,
        p.contact_number, p.email, p.family_number, p.family_contact_name, p.family_contact_relation,
        p.family_contact_number, p.family_email, p.is_minor, p.guardian_name,
        p.guardian_consent, p.privacy_consent, req.session.user.user_id,
      ]
    );
    audit.log(req.session.user.user_id, "create", "patient", rows[0].patient_id, p.full_name);
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

    const [appts, acctQ, dispensesQ, familyMembers] = await Promise.all([
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
      loadFamilyMembers(rows[0].family_number, req.params.id),
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
      familyMembers,
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
      familyLookup: await loadFamilyLookup(req.params.id),
      familyMembers: await loadFamilyMembers(rows[0].family_number, req.params.id),
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
      familyLookup: await loadFamilyLookup(req.params.id),
      familyMembers: await loadFamilyMembers(p.family_number, req.params.id),
      errors,
    });
  }
  try {
    const { rowCount } = await db.query(
      `UPDATE patients SET
         full_name=$1, birthdate=$2, sex=$3, address=$4, contact_number=$5, email=$6,
         family_number=$7, family_contact_name=$8, family_contact_relation=$9, family_contact_number=$10,
         family_email=$11, is_minor=$12, guardian_name=$13, guardian_consent=$14, privacy_consent=$15, updated_at=now()
       WHERE patient_id=$16`,
      [
        p.full_name, p.birthdate, p.sex, p.address, p.contact_number, p.email,
        p.family_number, p.family_contact_name, p.family_contact_relation, p.family_contact_number,
        p.family_email, p.is_minor, p.guardian_name, p.guardian_consent, p.privacy_consent, req.params.id,
      ]
    );
    if (!rowCount) return next();
    audit.log(req.session.user.user_id, "update", "patient", req.params.id, p.full_name);
    res.redirect(`/patients/${req.params.id}`);
  } catch (e) {
    next(e);
  }
});

// ---- LINK TO FAMILY  POST /patients/:id/ensure-family-number ---------------
// Fired when staff search-select an existing patient as "this patient's
// family" on the registration form. If that patient doesn't have a family
// number yet, assigns one now instead of telling staff to remember to add
// it on a second, separate edit — most people won't reliably do that.
router.post("/patients/:id/ensure-family-number", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "SELECT patient_id, family_number FROM patients WHERE patient_id=$1",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Patient not found." });
    if (rows[0].family_number) return res.json({ family_number: rows[0].family_number });

    const family_number = await nextFamilyNumber();
    await db.query("UPDATE patients SET family_number=$1, updated_at=now() WHERE patient_id=$2", [
      family_number,
      req.params.id,
    ]);
    audit.log(
      req.session.user.user_id,
      "update",
      "patient",
      req.params.id,
      `assigned family number (linked while registering another family member)`
    );
    res.json({ family_number });
  } catch (e) {
    next(e);
  }
});

// ---- DELETE  POST /patients/:id/delete (admin only) -------------------------
// FK ON DELETE CASCADE (appointments, patient_accounts, visits) means this
// removes every record tied to the patient, not just the patients row.
router.post("/patients/:id/delete", requireRole("admin"), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "DELETE FROM patients WHERE patient_id=$1 RETURNING full_name",
      [req.params.id]
    );
    if (!rows[0]) return next();
    audit.log(req.session.user.user_id, "delete", "patient", req.params.id, rows[0].full_name);
    res.redirect("/patients");
  } catch (e) {
    // medicine_dispenses has no ON DELETE CASCADE (medicine history is kept on
    // purpose) — a patient with dispense records can't be hard-deleted.
    if (e.code === "23503") {
      return res.redirect(
        `/patients/${req.params.id}?acct_err=${encodeURIComponent(
          "This patient has medicine dispense history and can't be deleted."
        )}`
      );
    }
    next(e);
  }
});

module.exports = router;
