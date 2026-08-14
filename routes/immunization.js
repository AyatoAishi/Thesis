// ============================================================================
// routes/immunization.js — per-vaccine dose tracking, matching the barangay's
// physical "Todo Ligtas" immunization card.
//
// Builds on `immunization_records`, a table that already existed in
// schema.sql from the original M2 plan (patient profile tabs) but was never
// wired up to any route or view — vaccine_name is free text there, not a
// foreign key, which is exactly what lets "Other vaccines" (not on the
// standard DOH list in lib/vaccines.js) get recorded the same way as any
// scheduled one, no separate handling needed.
//
// Scope: recording doses actually given, matching what the physical card
// tracks. `status`/`scheduled_date` exist on the table for a future
// scheduling/reminder feature, but nothing here builds that — every insert
// here is status='given' with a given_date.
// ============================================================================
const express = require("express");
const PDFDocument = require("pdfkit");
const db = require("../db");
const F = require("../lib/format");
const VACCINES = require("../lib/vaccines");
const audit = require("../lib/audit");
const { buildReportPdf } = require("../lib/pdf");
const { buildCard } = require("../lib/immunizationCard");

const router = express.Router();

const CATS = [
  ["infant", "Infant"],
  ["school", "School-aged children"],
  ["senior", "Senior citizen"],
];

function isDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function safeRedirect(res, back, fallback, flash) {
  const safe = back && back.startsWith("/") && !back.startsWith("//") ? back : fallback;
  const sep = safe.includes("?") ? "&" : "?";
  res.redirect(flash ? `${safe}${sep}flash=${encodeURIComponent(flash)}` : safe);
}

async function loadPatient(id) {
  const { rows } = await db.query("SELECT patient_id, full_name, patient_number, birthdate FROM patients WHERE patient_id=$1", [id]);
  return rows[0] || null;
}

// buildCard() moved to lib/immunizationCard.js — the patient portal renders
// the same card read-only, so both sides share one implementation.

// ---- CARD  GET /patients/:id/immunization -----------------------------------
router.get("/patients/:id/immunization", async (req, res, next) => {
  try {
    const patient = await loadPatient(req.params.id);
    if (!patient) return next();
    const { schedule, other } = await buildCard(patient.patient_id);

    res.render("patients/immunization", {
      title: `${patient.full_name} — Immunization · Sampaguita HC`,
      active: "patients",
      patient,
      schedule,
      other,
      flash: req.query.flash || null,
    });
  } catch (e) {
    next(e);
  }
});

// ---- RECORD DOSE form  GET /patients/:id/immunization/new -------------------
// ?vaccine=...&dose=... prefills from an empty slot's "Record" link on the
// card; staff can still change either before submitting.
router.get("/patients/:id/immunization/new", async (req, res, next) => {
  try {
    const patient = await loadPatient(req.params.id);
    if (!patient) return next();
    res.render("patients/immunization-form", {
      title: `Record a dose — ${patient.full_name} · Sampaguita HC`,
      active: "patients",
      patient,
      vaccines: VACCINES,
      values: {
        vaccine_name: req.query.vaccine || "",
        dose_number: req.query.dose || "",
        given_date: "",
        remarks: "",
      },
      errors: [],
    });
  } catch (e) {
    next(e);
  }
});

// ---- CREATE  POST /patients/:id/immunization ---------------------------------
router.post("/patients/:id/immunization", async (req, res, next) => {
  try {
    const patient = await loadPatient(req.params.id);
    if (!patient) return next();

    const isOther = req.body.vaccine_name === "__other__";
    const values = {
      vaccine_name: (isOther ? req.body.other_vaccine_name : req.body.vaccine_name || "").trim(),
      dose_number: (req.body.dose_number || "").trim(),
      given_date: req.body.given_date || "",
      remarks: (req.body.remarks || "").trim(),
    };

    const errors = [];
    if (!values.vaccine_name) errors.push("Choose or name a vaccine.");
    const doseNumber = parseInt(values.dose_number, 10);
    if (!Number.isInteger(doseNumber) || doseNumber < 1) errors.push("Dose number must be 1 or higher.");
    if (!isDate(values.given_date)) errors.push("Enter a valid date given.");

    if (errors.length) {
      return res.status(400).render("patients/immunization-form", {
        title: `Record a dose — ${patient.full_name} · Sampaguita HC`,
        active: "patients",
        patient,
        vaccines: VACCINES,
        values: { ...values, dose_number: values.dose_number },
        errors,
      });
    }

    await db.query(
      `INSERT INTO immunization_records
         (patient_id, vaccine_name, dose_number, given_date, status, administered_by, remarks)
       VALUES ($1,$2,$3,$4,'given',$5,$6)`,
      [patient.patient_id, values.vaccine_name, doseNumber, values.given_date, req.session.user.user_id, values.remarks || null]
    );
    audit.log(
      req.session.user.user_id,
      "create",
      "immunization",
      patient.patient_id,
      `${values.vaccine_name} dose ${doseNumber} for ${patient.full_name}`
    );
    safeRedirect(res, null, `/patients/${patient.patient_id}/immunization`, "Dose recorded.");
  } catch (e) {
    next(e);
  }
});

// ---- UNDO a recorded dose  POST /patients/:id/immunization/:immId/delete ----
// Corrects a mis-entry — no approval step, same as other simple undo actions
// in this app (e.g. rejecting a pending dispense).
router.post("/patients/:id/immunization/:immId/delete", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "DELETE FROM immunization_records WHERE imm_id=$1 AND patient_id=$2 RETURNING vaccine_name, dose_number",
      [req.params.immId, req.params.id]
    );
    if (rows[0]) {
      audit.log(
        req.session.user.user_id,
        "delete",
        "immunization",
        req.params.id,
        `removed ${rows[0].vaccine_name} dose ${rows[0].dose_number}`
      );
    }
    safeRedirect(res, null, `/patients/${req.params.id}/immunization`, rows[0] ? "Dose record removed." : "Nothing to remove.");
  } catch (e) {
    next(e);
  }
});

// ---- PDF EXPORT  GET /patients/:id/immunization/export ----------------------
router.get("/patients/:id/immunization/export", async (req, res, next) => {
  try {
    const patient = await loadPatient(req.params.id);
    if (!patient) return next();
    const { schedule, other } = await buildCard(patient.patient_id);

    const sections = CATS.map(([catKey, catLabel]) => {
      const rows = schedule.filter((v) => v.category === catKey);
      return {
        title: catLabel,
        headers: ["Vaccine", "Schedule", "Doses given"],
        rows: rows.map((v) => [
          v.name,
          v.schedule,
          v.doseSlots.some((s) => s.given)
            ? v.doseSlots
                .filter((s) => s.given)
                .map((s) => `Dose ${s.doseNumber}: ${F.longDate(new Date(s.date).toISOString().slice(0, 10))}`)
                .join("; ")
            : "None yet",
        ]),
        widths: [190, 140, 165],
      };
    });

    sections.push({
      title: "Other vaccines given",
      headers: ["Vaccine", "Dose", "Date given", "Remarks"],
      rows: other.length
        ? other.map((r) => [
            r.vaccine_name,
            r.dose_number,
            F.longDate(new Date(r.given_date).toISOString().slice(0, 10)),
            r.remarks || "—",
          ])
        : [],
      widths: [150, 45, 100, 200],
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${patient.patient_number}-immunization.pdf"`);
    const doc = new PDFDocument({ margin: 50, size: "A4", compress: false });
    doc.pipe(res);
    buildReportPdf(doc, {
      title: `Immunization record — ${patient.full_name}`,
      subtitle: patient.patient_number,
      generatedBy: req.session.user.full_name,
      sections,
    });
    doc.end();
  } catch (e) {
    next(e);
  }
});

module.exports = router;
