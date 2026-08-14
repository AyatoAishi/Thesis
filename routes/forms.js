// ============================================================================
// routes/forms.js — one place to reach the paper-form modules (teammates'
// note #2: "di mabilis makita kung nasaan ung forms").
//
// Immunization and Prenatal are per-patient records living under
// /patients/:id/…, so there was no way to reach them without first finding
// the patient — this page puts the patient search and the form in the same
// step. Family planning is a clinic-wide report, so it just links out.
//
// Nothing new is stored here; every route below is a lookup + redirect.
// ============================================================================
const express = require("express");
const db = require("../db");

const router = express.Router();

// Roles allowed to open the reports section (mirrors REPORT_ROLES in
// routes/reports.js) — used to hide the family-planning link from staff who
// would only get a 403 by following it.
const REPORT_ROLES = ["nurse", "recorder", "admin"];

const KINDS = {
  immunization: { path: "immunization", label: "Immunization card" },
  prenatal: { path: "prenatal", label: "Pre-natal record" },
};

// ---- HUB  GET /forms --------------------------------------------------------
router.get("/forms", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "SELECT patient_id, patient_number, full_name, sex FROM patients ORDER BY full_name LIMIT 500"
    );
    res.render("forms/index", {
      title: "Forms · Sampaguita HC",
      active: "forms",
      patients: rows,
      // Prenatal is hidden on male patients' profiles, so it's hidden here too
      // rather than offering a search that leads to a page they'd never use.
      prenatalPatients: rows.filter((p) => p.sex !== "male"),
      canSeeReports: REPORT_ROLES.includes(req.session.user.role),
      error: req.query.err || null,
    });
  } catch (e) {
    next(e);
  }
});

// ---- OPEN  GET /forms/open?kind=…&patient_id=… -------------------------------
router.get("/forms/open", async (req, res, next) => {
  try {
    const kind = KINDS[req.query.kind];
    const patientId = parseInt(req.query.patient_id, 10) || 0;
    const oops = (msg) => res.redirect(`/forms?err=${encodeURIComponent(msg)}`);

    if (!kind) return oops("Pick which form to open.");
    if (!patientId) return oops(`Search and pick a patient first for the ${kind.label.toLowerCase()}.`);

    const { rows } = await db.query("SELECT patient_id FROM patients WHERE patient_id=$1", [patientId]);
    if (!rows[0]) return oops("That patient no longer exists.");

    res.redirect(`/patients/${patientId}/${kind.path}`);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
