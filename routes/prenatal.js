// ============================================================================
// routes/prenatal.js — Pre-Natal Record module, matching the barangay's paper
// "Pre-Natal Record" chart.
//
// Three tables (db/migrations/2026-08-08-prenatal-record.js):
//   prenatal_records  — one row per pregnancy (a patient can have several
//                       over time, so this is its own table, not columns
//                       bolted onto `patients`)
//   prenatal_children — the delivery-history table on the same paper form
//   prenatal_visits   — repeatable per-visit follow-ups
//
// PhilHealth number intentionally left out — not tracked anywhere in this
// system (same call as the Senior Citizen report).
// ============================================================================
const express = require("express");
const PDFDocument = require("pdfkit");
const db = require("../db");
const F = require("../lib/format");
const audit = require("../lib/audit");
const { buildReportPdf } = require("../lib/pdf");

const router = express.Router();

function isDate(s) {
  if (!s) return true; // most date fields here are optional
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toIntOrNull(v) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) ? n : null;
}

function toNumOrNull(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function loadPatient(id) {
  const { rows } = await db.query("SELECT patient_id, full_name, patient_number, birthdate, sex FROM patients WHERE patient_id=$1", [id]);
  return rows[0] || null;
}

async function loadRecord(patientId, prenatalId) {
  const { rows } = await db.query(
    "SELECT * FROM prenatal_records WHERE prenatal_id=$1 AND patient_id=$2",
    [prenatalId, patientId]
  );
  return rows[0] || null;
}

function readIntakeForm(body) {
  return {
    husband_name: (body.husband_name || "").trim() || null,
    husband_birthdate: body.husband_birthdate || null,
    occupation: (body.occupation || "").trim() || null,
    gravida: toIntOrNull(body.gravida),
    para: toIntOrNull(body.para),
    lmp: body.lmp || null,
    edd: body.edd || null,
    aog_at_intake: (body.aog_at_intake || "").trim() || null,
    bp_at_intake: (body.bp_at_intake || "").trim() || null,
    pregnancy_test_date: body.pregnancy_test_date || null,
    vdrl_date: body.vdrl_date || null,
    hbsag_date: body.hbsag_date || null,
    hiv_screening_date: body.hiv_screening_date || null,
    ogtt_fbs_hba1c: (body.ogtt_fbs_hba1c || "").trim() || null,
    cbc_date: body.cbc_date || null,
    urinalysis_date: body.urinalysis_date || null,
    fh_hypertension: body.fh_hypertension === "on",
    fh_diabetes: body.fh_diabetes === "on",
    fh_asthma: body.fh_asthma === "on",
    fh_others: (body.fh_others || "").trim() || null,
    bmi: toNumOrNull(body.bmi),
    tt1_date: body.tt1_date || null,
    tt2_date: body.tt2_date || null,
    tt3_date: body.tt3_date || null,
    tt4_date: body.tt4_date || null,
    tt5_date: body.tt5_date || null,
  };
}

function validateIntake(p) {
  const errors = [];
  const dateFields = [
    ["husband_birthdate", "Husband's birthdate"], ["lmp", "LMP"], ["edd", "EDD"],
    ["pregnancy_test_date", "Pregnancy test date"], ["vdrl_date", "VDRL date"],
    ["hbsag_date", "HBsAg date"], ["hiv_screening_date", "HIV screening date"],
    ["cbc_date", "CBC date"], ["urinalysis_date", "Urinalysis date"],
    ["tt1_date", "TT1 date"], ["tt2_date", "TT2 date"], ["tt3_date", "TT3 date"],
    ["tt4_date", "TT4 date"], ["tt5_date", "TT5 date"],
  ];
  dateFields.forEach(([key, label]) => {
    if (p[key] && !isDate(p[key])) errors.push(`${label} isn't a valid date.`);
  });
  return errors;
}

// EDD via Naegele's rule (LMP + 280 days) — a starting suggestion only; staff
// can override (real EDD often gets adjusted by ultrasound dating).
function suggestEdd(lmp) {
  if (!isDate(lmp)) return null;
  const [y, m, d] = lmp.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 280);
  return dt.toISOString().slice(0, 10);
}

// ---- INDEX  GET /patients/:id/prenatal --------------------------------------
router.get("/patients/:id/prenatal", async (req, res, next) => {
  try {
    const patient = await loadPatient(req.params.id);
    if (!patient) return next();
    const { rows } = await db.query(
      "SELECT * FROM prenatal_records WHERE patient_id=$1 ORDER BY created_at DESC",
      [patient.patient_id]
    );
    // created_at is a TIMESTAMPTZ; lmp/edd are plain DATE. Format both to
    // Manila-correct display strings here rather than doing timezone-aware
    // date math inside the EJS template.
    const records = rows.map((r) => ({
      ...r,
      startedDisplay: F.longDate(new Date(r.created_at).toLocaleDateString("en-CA", { timeZone: F.TZ })),
      lmpDisplay: r.lmp ? F.longDate(new Date(r.lmp).toISOString().slice(0, 10)) : "—",
      eddDisplay: r.edd ? F.longDate(new Date(r.edd).toISOString().slice(0, 10)) : "—",
    }));
    res.render("patients/prenatal-index", {
      title: `${patient.full_name} — Prenatal · Sampaguita HC`,
      active: "patients",
      patient,
      records,
      flash: req.query.flash || null,
    });
  } catch (e) {
    next(e);
  }
});

// ---- NEW intake form  GET /patients/:id/prenatal/new ------------------------
router.get("/patients/:id/prenatal/new", async (req, res, next) => {
  try {
    const patient = await loadPatient(req.params.id);
    if (!patient) return next();
    res.render("patients/prenatal-form", {
      title: `New prenatal record — ${patient.full_name} · Sampaguita HC`,
      active: "patients",
      mode: "new",
      patient,
      record: {},
      errors: [],
    });
  } catch (e) {
    next(e);
  }
});

// ---- CREATE  POST /patients/:id/prenatal -------------------------------------
router.post("/patients/:id/prenatal", async (req, res, next) => {
  try {
    const patient = await loadPatient(req.params.id);
    if (!patient) return next();
    const p = readIntakeForm(req.body);
    if (!p.edd && p.lmp) p.edd = suggestEdd(p.lmp);
    const errors = validateIntake(p);
    if (errors.length) {
      return res.status(400).render("patients/prenatal-form", {
        title: `New prenatal record — ${patient.full_name} · Sampaguita HC`,
        active: "patients",
        mode: "new",
        patient,
        record: p,
        errors,
      });
    }
    const { rows } = await db.query(
      `INSERT INTO prenatal_records
         (patient_id, husband_name, husband_birthdate, occupation, gravida, para, lmp, edd,
          aog_at_intake, bp_at_intake, pregnancy_test_date, vdrl_date, hbsag_date, hiv_screening_date,
          ogtt_fbs_hba1c, cbc_date, urinalysis_date, fh_hypertension, fh_diabetes, fh_asthma,
          fh_others, bmi, tt1_date, tt2_date, tt3_date, tt4_date, tt5_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
       RETURNING prenatal_id`,
      [
        patient.patient_id, p.husband_name, p.husband_birthdate, p.occupation, p.gravida, p.para, p.lmp, p.edd,
        p.aog_at_intake, p.bp_at_intake, p.pregnancy_test_date, p.vdrl_date, p.hbsag_date, p.hiv_screening_date,
        p.ogtt_fbs_hba1c, p.cbc_date, p.urinalysis_date, p.fh_hypertension, p.fh_diabetes, p.fh_asthma,
        p.fh_others, p.bmi, p.tt1_date, p.tt2_date, p.tt3_date, p.tt4_date, p.tt5_date, req.session.user.user_id,
      ]
    );
    audit.log(req.session.user.user_id, "create", "prenatal", rows[0].prenatal_id, `started for ${patient.full_name}`);
    res.redirect(`/patients/${patient.patient_id}/prenatal/${rows[0].prenatal_id}`);
  } catch (e) {
    next(e);
  }
});

// ---- DETAIL  GET /patients/:id/prenatal/:prenatalId --------------------------
router.get("/patients/:id/prenatal/:prenatalId", async (req, res, next) => {
  try {
    const patient = await loadPatient(req.params.id);
    if (!patient) return next();
    const record = await loadRecord(patient.patient_id, req.params.prenatalId);
    if (!record) return next();

    const [childrenQ, visitsQ] = await Promise.all([
      db.query("SELECT * FROM prenatal_children WHERE prenatal_id=$1 ORDER BY child_number", [record.prenatal_id]),
      db.query(
        `SELECT v.*, u.full_name AS recorded_by_name
           FROM prenatal_visits v LEFT JOIN users u ON u.user_id = v.recorded_by
          WHERE v.prenatal_id=$1 ORDER BY v.visit_date DESC, v.created_at DESC`,
        [record.prenatal_id]
      ),
    ]);

    res.render("patients/prenatal-detail", {
      title: `Prenatal record — ${patient.full_name} · Sampaguita HC`,
      active: "patients",
      patient,
      record,
      children: childrenQ.rows,
      visits: visitsQ.rows,
      longDate: F.longDate,
      flash: req.query.flash || null,
    });
  } catch (e) {
    next(e);
  }
});

// ---- EDIT intake form  GET /patients/:id/prenatal/:prenatalId/edit ----------
router.get("/patients/:id/prenatal/:prenatalId/edit", async (req, res, next) => {
  try {
    const patient = await loadPatient(req.params.id);
    if (!patient) return next();
    const record = await loadRecord(patient.patient_id, req.params.prenatalId);
    if (!record) return next();
    res.render("patients/prenatal-form", {
      title: `Edit prenatal record — ${patient.full_name} · Sampaguita HC`,
      active: "patients",
      mode: "edit",
      patient,
      record,
      errors: [],
    });
  } catch (e) {
    next(e);
  }
});

// ---- UPDATE  POST /patients/:id/prenatal/:prenatalId -------------------------
router.post("/patients/:id/prenatal/:prenatalId", async (req, res, next) => {
  try {
    const patient = await loadPatient(req.params.id);
    if (!patient) return next();
    const existing = await loadRecord(patient.patient_id, req.params.prenatalId);
    if (!existing) return next();

    const p = readIntakeForm(req.body);
    const errors = validateIntake(p);
    if (errors.length) {
      return res.status(400).render("patients/prenatal-form", {
        title: `Edit prenatal record — ${patient.full_name} · Sampaguita HC`,
        active: "patients",
        mode: "edit",
        patient,
        record: { ...p, prenatal_id: existing.prenatal_id, status: existing.status },
        errors,
      });
    }
    await db.query(
      `UPDATE prenatal_records SET
         husband_name=$1, husband_birthdate=$2, occupation=$3, gravida=$4, para=$5, lmp=$6, edd=$7,
         aog_at_intake=$8, bp_at_intake=$9, pregnancy_test_date=$10, vdrl_date=$11, hbsag_date=$12,
         hiv_screening_date=$13, ogtt_fbs_hba1c=$14, cbc_date=$15, urinalysis_date=$16,
         fh_hypertension=$17, fh_diabetes=$18, fh_asthma=$19, fh_others=$20, bmi=$21,
         tt1_date=$22, tt2_date=$23, tt3_date=$24, tt4_date=$25, tt5_date=$26, updated_at=now()
       WHERE prenatal_id=$27`,
      [
        p.husband_name, p.husband_birthdate, p.occupation, p.gravida, p.para, p.lmp, p.edd,
        p.aog_at_intake, p.bp_at_intake, p.pregnancy_test_date, p.vdrl_date, p.hbsag_date,
        p.hiv_screening_date, p.ogtt_fbs_hba1c, p.cbc_date, p.urinalysis_date,
        p.fh_hypertension, p.fh_diabetes, p.fh_asthma, p.fh_others, p.bmi,
        p.tt1_date, p.tt2_date, p.tt3_date, p.tt4_date, p.tt5_date, existing.prenatal_id,
      ]
    );
    audit.log(req.session.user.user_id, "update", "prenatal", existing.prenatal_id, `updated for ${patient.full_name}`);
    res.redirect(`/patients/${patient.patient_id}/prenatal/${existing.prenatal_id}`);
  } catch (e) {
    next(e);
  }
});

// ---- STATUS change  POST /patients/:id/prenatal/:prenatalId/status ----------
router.post("/patients/:id/prenatal/:prenatalId/status", async (req, res, next) => {
  try {
    if (!["active", "delivered", "closed"].includes(req.body.status)) return res.status(400).send("Invalid status.");
    const { rows } = await db.query(
      "UPDATE prenatal_records SET status=$1, updated_at=now() WHERE prenatal_id=$2 AND patient_id=$3 RETURNING prenatal_id",
      [req.body.status, req.params.prenatalId, req.params.id]
    );
    if (!rows[0]) return next();
    audit.log(req.session.user.user_id, "update", "prenatal", rows[0].prenatal_id, `status set to ${req.body.status}`);
    res.redirect(`/patients/${req.params.id}/prenatal/${req.params.prenatalId}?flash=${encodeURIComponent("Status updated.")}`);
  } catch (e) {
    next(e);
  }
});

// ---- ADD child/delivery-history entry  GET .../children/new -----------------
router.get("/patients/:id/prenatal/:prenatalId/children/new", async (req, res, next) => {
  try {
    const patient = await loadPatient(req.params.id);
    if (!patient) return next();
    const record = await loadRecord(patient.patient_id, req.params.prenatalId);
    if (!record) return next();
    const { rows } = await db.query("SELECT count(*)::int n FROM prenatal_children WHERE prenatal_id=$1", [record.prenatal_id]);
    res.render("patients/prenatal-child-form", {
      title: `Add child — ${patient.full_name} · Sampaguita HC`,
      active: "patients",
      patient,
      record,
      values: { child_number: rows[0].n + 1, dob: "", sex: "", delivery_type: "", attended_by_text: "", place_of_birth: "" },
      errors: [],
    });
  } catch (e) {
    next(e);
  }
});

// ---- ADD child/delivery-history entry  POST .../children --------------------
router.post("/patients/:id/prenatal/:prenatalId/children", async (req, res, next) => {
  try {
    const patient = await loadPatient(req.params.id);
    if (!patient) return next();
    const record = await loadRecord(patient.patient_id, req.params.prenatalId);
    if (!record) return next();

    const values = {
      child_number: toIntOrNull(req.body.child_number),
      dob: req.body.dob || null,
      sex: req.body.sex || null,
      delivery_type: (req.body.delivery_type || "").trim() || null,
      attended_by_text: (req.body.attended_by_text || "").trim() || null,
      place_of_birth: (req.body.place_of_birth || "").trim() || null,
    };
    const errors = [];
    if (!values.child_number || values.child_number < 1) errors.push("Child number must be 1 or higher.");
    if (values.dob && !isDate(values.dob)) errors.push("Date of birth isn't valid.");

    if (errors.length) {
      return res.status(400).render("patients/prenatal-child-form", {
        title: `Add child — ${patient.full_name} · Sampaguita HC`,
        active: "patients",
        patient,
        record,
        values,
        errors,
      });
    }

    await db.query(
      `INSERT INTO prenatal_children (prenatal_id, child_number, dob, sex, delivery_type, attended_by_text, place_of_birth)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [record.prenatal_id, values.child_number, values.dob, values.sex, values.delivery_type, values.attended_by_text, values.place_of_birth]
    );
    audit.log(req.session.user.user_id, "create", "prenatal_child", record.prenatal_id, `child ${values.child_number} added for ${patient.full_name}`);
    res.redirect(`/patients/${patient.patient_id}/prenatal/${record.prenatal_id}?flash=${encodeURIComponent("Child record added.")}`);
  } catch (e) {
    next(e);
  }
});

// ---- REMOVE child entry  POST .../children/:childId/delete ------------------
router.post("/patients/:id/prenatal/:prenatalId/children/:childId/delete", async (req, res, next) => {
  try {
    const { rowCount } = await db.query(
      "DELETE FROM prenatal_children WHERE child_id=$1 AND prenatal_id=$2",
      [req.params.childId, req.params.prenatalId]
    );
    if (rowCount) audit.log(req.session.user.user_id, "delete", "prenatal_child", req.params.prenatalId, "child record removed");
    res.redirect(`/patients/${req.params.id}/prenatal/${req.params.prenatalId}?flash=${encodeURIComponent(rowCount ? "Removed." : "Nothing to remove.")}`);
  } catch (e) {
    next(e);
  }
});

// ---- ADD visit follow-up  GET .../visits/new ---------------------------------
router.get("/patients/:id/prenatal/:prenatalId/visits/new", async (req, res, next) => {
  try {
    const patient = await loadPatient(req.params.id);
    if (!patient) return next();
    const record = await loadRecord(patient.patient_id, req.params.prenatalId);
    if (!record) return next();
    res.render("patients/prenatal-visit-form", {
      title: `Add visit — ${patient.full_name} · Sampaguita HC`,
      active: "patients",
      patient,
      record,
      values: {},
      errors: [],
    });
  } catch (e) {
    next(e);
  }
});

// ---- ADD visit follow-up  POST .../visits -------------------------------------
router.post("/patients/:id/prenatal/:prenatalId/visits", async (req, res, next) => {
  try {
    const patient = await loadPatient(req.params.id);
    if (!patient) return next();
    const record = await loadRecord(patient.patient_id, req.params.prenatalId);
    if (!record) return next();

    const b = req.body;
    const values = {
      visit_date: b.visit_date || F.manilaToday(),
      aog: (b.aog || "").trim() || null,
      bp: (b.bp || "").trim() || null,
      weight_kg: toNumOrNull(b.weight_kg),
      fundal_height_cm: toNumOrNull(b.fundal_height_cm),
      fetal_heart_tone: (b.fetal_heart_tone || "").trim() || null,
      abdominal_contractions: b.abdominal_contractions === "on",
      vaginal_spotting: b.vaginal_spotting === "on",
      vaginal_discharge: b.vaginal_discharge === "on",
      dysuria: b.dysuria === "on",
      low_back_pain: b.low_back_pain === "on",
      hypogastric_pain: b.hypogastric_pain === "on",
      edema: b.edema === "on",
      notes: (b.notes || "").trim() || null,
    };
    const errors = [];
    if (!isDate(values.visit_date) || !values.visit_date) errors.push("Enter a valid visit date.");

    if (errors.length) {
      return res.status(400).render("patients/prenatal-visit-form", {
        title: `Add visit — ${patient.full_name} · Sampaguita HC`,
        active: "patients",
        patient,
        record,
        values,
        errors,
      });
    }

    await db.query(
      `INSERT INTO prenatal_visits
         (prenatal_id, visit_date, aog, bp, weight_kg, fundal_height_cm, fetal_heart_tone,
          abdominal_contractions, vaginal_spotting, vaginal_discharge, dysuria, low_back_pain,
          hypogastric_pain, edema, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        record.prenatal_id, values.visit_date, values.aog, values.bp, values.weight_kg, values.fundal_height_cm,
        values.fetal_heart_tone, values.abdominal_contractions, values.vaginal_spotting, values.vaginal_discharge,
        values.dysuria, values.low_back_pain, values.hypogastric_pain, values.edema, values.notes,
        req.session.user.user_id,
      ]
    );
    audit.log(req.session.user.user_id, "create", "prenatal_visit", record.prenatal_id, `visit recorded for ${patient.full_name}`);
    res.redirect(`/patients/${patient.patient_id}/prenatal/${record.prenatal_id}?flash=${encodeURIComponent("Visit recorded.")}`);
  } catch (e) {
    next(e);
  }
});

// ---- REMOVE visit  POST .../visits/:visitId/delete ---------------------------
router.post("/patients/:id/prenatal/:prenatalId/visits/:visitId/delete", async (req, res, next) => {
  try {
    const { rowCount } = await db.query(
      "DELETE FROM prenatal_visits WHERE visit_id=$1 AND prenatal_id=$2",
      [req.params.visitId, req.params.prenatalId]
    );
    if (rowCount) audit.log(req.session.user.user_id, "delete", "prenatal_visit", req.params.prenatalId, "visit removed");
    res.redirect(`/patients/${req.params.id}/prenatal/${req.params.prenatalId}?flash=${encodeURIComponent(rowCount ? "Visit removed." : "Nothing to remove.")}`);
  } catch (e) {
    next(e);
  }
});

// ---- PDF EXPORT  GET /patients/:id/prenatal/:prenatalId/export --------------
router.get("/patients/:id/prenatal/:prenatalId/export", async (req, res, next) => {
  try {
    const patient = await loadPatient(req.params.id);
    if (!patient) return next();
    const record = await loadRecord(patient.patient_id, req.params.prenatalId);
    if (!record) return next();

    const [childrenQ, visitsQ] = await Promise.all([
      db.query("SELECT * FROM prenatal_children WHERE prenatal_id=$1 ORDER BY child_number", [record.prenatal_id]),
      db.query("SELECT * FROM prenatal_visits WHERE prenatal_id=$1 ORDER BY visit_date", [record.prenatal_id]),
    ]);

    const d = (v) => (v ? F.longDate(new Date(v).toISOString().slice(0, 10)) : "—");
    const symptomList = (v) => {
      const flags = [];
      if (v.abdominal_contractions) flags.push("Abdominal contractions");
      if (v.vaginal_spotting) flags.push("Vaginal spotting");
      if (v.vaginal_discharge) flags.push("Vaginal discharge");
      if (v.dysuria) flags.push("Dysuria");
      if (v.low_back_pain) flags.push("Low back pain");
      if (v.hypogastric_pain) flags.push("Hypogastric pain");
      if (v.edema) flags.push("Edema");
      return flags.length ? flags.join(", ") : "None reported";
    };

    const sections = [
      {
        title: "Intake",
        kv: [
          ["Husband's name", record.husband_name || "—"],
          ["Occupation", record.occupation || "—"],
          ["Gravida / Para", `G${record.gravida ?? "—"} P${record.para ?? "—"}`],
          ["LMP", d(record.lmp)],
          ["EDD", d(record.edd)],
          ["AOG at intake", record.aog_at_intake || "—"],
          ["BP at intake", record.bp_at_intake || "—"],
          ["BMI", record.bmi ?? "—"],
          ["Status", record.status],
        ],
      },
      {
        title: "Lab results",
        kv: [
          ["VDRL", d(record.vdrl_date)],
          ["HBsAg", d(record.hbsag_date)],
          ["HIV screening", d(record.hiv_screening_date)],
          ["OGTT/FBS/HbA1c", record.ogtt_fbs_hba1c || "—"],
          ["CBC", d(record.cbc_date)],
          ["Urinalysis", d(record.urinalysis_date)],
        ],
      },
      {
        title: "Family history & tetanus doses",
        kv: [
          ["Hypertension", record.fh_hypertension ? "Yes" : "No"],
          ["Diabetes", record.fh_diabetes ? "Yes" : "No"],
          ["Asthma", record.fh_asthma ? "Yes" : "No"],
          ["Others", record.fh_others || "—"],
          ["TT1/TD1", d(record.tt1_date)], ["TT2/TD2", d(record.tt2_date)],
          ["TT3/TD3", d(record.tt3_date)], ["TT4/TD4", d(record.tt4_date)], ["TT5/TD5", d(record.tt5_date)],
        ],
      },
      {
        title: "Children / delivery history",
        headers: ["#", "DOB", "Sex", "Delivery", "Attended by", "Place of birth"],
        rows: childrenQ.rows.length
          ? childrenQ.rows.map((c) => [c.child_number, d(c.dob), c.sex || "—", c.delivery_type || "—", c.attended_by_text || "—", c.place_of_birth || "—"])
          : [],
        widths: [25, 90, 45, 70, 100, 165],
      },
      {
        title: "Visit history",
        headers: ["Date", "AOG", "BP", "Weight", "FH", "FHT", "Symptoms", "Notes"],
        rows: visitsQ.rows.length
          ? visitsQ.rows.map((v) => [
              d(v.visit_date), v.aog || "—", v.bp || "—",
              v.weight_kg != null ? `${v.weight_kg} kg` : "—",
              v.fundal_height_cm != null ? `${v.fundal_height_cm} cm` : "—",
              v.fetal_heart_tone || "—", symptomList(v), v.notes || "—",
            ])
          : [],
        widths: [55, 40, 40, 45, 35, 40, 130, 110],
      },
    ];

    // created_at is a TIMESTAMPTZ (has a real time-of-day + timezone), unlike
    // the plain DATE columns d() handles — convert via Manila's calendar date
    // first so a record started just after midnight doesn't show the wrong day.
    const startedDate = F.longDate(new Date(record.created_at).toLocaleDateString("en-CA", { timeZone: F.TZ }));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${patient.patient_number}-prenatal.pdf"`);
    const doc = new PDFDocument({ margin: 50, size: "A4", compress: false });
    doc.pipe(res);
    buildReportPdf(doc, {
      title: `Pre-natal record — ${patient.full_name}`,
      subtitle: `${patient.patient_number} · started ${startedDate}`,
      generatedBy: req.session.user.full_name,
      sections,
    });
    doc.end();
  } catch (e) {
    next(e);
  }
});

module.exports = router;
