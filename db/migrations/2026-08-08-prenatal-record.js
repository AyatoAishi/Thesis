// One-off migration: Pre-Natal Record module — matches the barangay's paper
// "Pre-Natal Record" chart. Three tables:
//   prenatal_records  — one row per pregnancy (intake: husband info,
//                       G/P/LMP/EDD, lab results, family history, tetanus doses)
//   prenatal_children — the delivery-history table on the same paper form
//                       (previous children: DOB, sex, delivery type, place)
//   prenatal_visits   — repeatable per-visit follow-ups (AOG, BP, weight,
//                       fundal height, FHT, symptom checklist, notes)
// PhilHealth number intentionally left out (explicit call: same as the
// Senior Citizen report, not tracked anywhere in this system).
// Safe to re-run (IF NOT EXISTS everywhere). Usage: node db/migrations/2026-08-08-prenatal-record.js
require("dotenv").config();
const db = require("..");

(async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS prenatal_records (
    prenatal_id          SERIAL PRIMARY KEY,
    patient_id           INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    husband_name         VARCHAR(150),
    husband_birthdate    DATE,
    occupation           VARCHAR(100),
    gravida              INTEGER,
    para                 INTEGER,
    lmp                  DATE,
    edd                  DATE,
    aog_at_intake        VARCHAR(30),
    bp_at_intake         VARCHAR(20),
    pregnancy_test_date  DATE,
    vdrl_date            DATE,
    hbsag_date           DATE,
    hiv_screening_date   DATE,
    ogtt_fbs_hba1c       VARCHAR(100),
    cbc_date             DATE,
    urinalysis_date      DATE,
    fh_hypertension      BOOLEAN NOT NULL DEFAULT false,
    fh_diabetes          BOOLEAN NOT NULL DEFAULT false,
    fh_asthma            BOOLEAN NOT NULL DEFAULT false,
    fh_others            VARCHAR(150),
    bmi                  NUMERIC(4,1),
    tt1_date             DATE,
    tt2_date             DATE,
    tt3_date             DATE,
    tt4_date             DATE,
    tt5_date             DATE,
    status               VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active','delivered','closed')),
    created_by           INTEGER REFERENCES users(user_id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  console.log("OK: prenatal_records ready.");

  await db.query(`CREATE INDEX IF NOT EXISTS idx_prenatal_records_patient ON prenatal_records (patient_id)`);
  console.log("OK: index on prenatal_records.patient_id added.");

  await db.query(`CREATE TABLE IF NOT EXISTS prenatal_children (
    child_id           SERIAL PRIMARY KEY,
    prenatal_id        INTEGER NOT NULL REFERENCES prenatal_records(prenatal_id) ON DELETE CASCADE,
    child_number        INTEGER NOT NULL,
    dob                DATE,
    sex                VARCHAR(10),
    delivery_type       VARCHAR(20),
    attended_by_text     VARCHAR(100),
    place_of_birth      VARCHAR(150)
  )`);
  console.log("OK: prenatal_children ready.");

  await db.query(`CREATE TABLE IF NOT EXISTS prenatal_visits (
    visit_id                SERIAL PRIMARY KEY,
    prenatal_id             INTEGER NOT NULL REFERENCES prenatal_records(prenatal_id) ON DELETE CASCADE,
    visit_date              DATE NOT NULL DEFAULT CURRENT_DATE,
    aog                     VARCHAR(30),
    bp                      VARCHAR(20),
    weight_kg               NUMERIC(5,2),
    fundal_height_cm        NUMERIC(5,2),
    fetal_heart_tone        VARCHAR(20),
    abdominal_contractions  BOOLEAN NOT NULL DEFAULT false,
    vaginal_spotting        BOOLEAN NOT NULL DEFAULT false,
    vaginal_discharge       BOOLEAN NOT NULL DEFAULT false,
    dysuria                 BOOLEAN NOT NULL DEFAULT false,
    low_back_pain           BOOLEAN NOT NULL DEFAULT false,
    hypogastric_pain        BOOLEAN NOT NULL DEFAULT false,
    edema                   BOOLEAN NOT NULL DEFAULT false,
    notes                   VARCHAR(500),
    recorded_by             INTEGER REFERENCES users(user_id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  console.log("OK: prenatal_visits ready.");

  await db.query(`CREATE INDEX IF NOT EXISTS idx_prenatal_visits_record ON prenatal_visits (prenatal_id)`);
  console.log("OK: index on prenatal_visits.prenatal_id added.");

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
