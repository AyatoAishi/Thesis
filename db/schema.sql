-- ============================================================================
-- Barangay Sampaguita Health Clinic — Web-Based EMR + Appointment System
-- PostgreSQL database schema (starter / v1)
-- Group 7
--
-- How to use:
--   1) Create a database (locally or on Neon/Supabase):  CREATE DATABASE sampaguita;
--   2) Run this file:   psql -d sampaguita -f schema.sql
--
-- Notes:
--   - SERIAL = auto-incrementing ID (Postgres).
--   - TIMESTAMPTZ = timestamp with timezone (use this, not plain TIMESTAMP).
--   - CHECK (...) restricts a column to a fixed set of values (like a dropdown).
--   - REFERENCES = a foreign key: links a row to another table.
-- ============================================================================

-- Clean start (safe to re-run during development). Order matters (children first).
DROP TABLE IF EXISTS prenatal_visits    CASCADE;
DROP TABLE IF EXISTS prenatal_children  CASCADE;
DROP TABLE IF EXISTS prenatal_records   CASCADE;
DROP TABLE IF EXISTS audit_log          CASCADE;
DROP TABLE IF EXISTS notifications      CASCADE;
DROP TABLE IF EXISTS immunization_records CASCADE;
DROP TABLE IF EXISTS medicine_dispenses CASCADE;
DROP TABLE IF EXISTS medicines          CASCADE;
DROP TABLE IF EXISTS visits             CASCADE;
DROP TABLE IF EXISTS appointments       CASCADE;
DROP TABLE IF EXISTS services           CASCADE;
DROP TABLE IF EXISTS patient_accounts   CASCADE;
DROP TABLE IF EXISTS patients           CASCADE;
DROP TABLE IF EXISTS users              CASCADE;


-- 1) USERS — clinic staff (this powers role-based access) ---------------------
CREATE TABLE users (
    user_id       SERIAL PRIMARY KEY,
    full_name     VARCHAR(150) NOT NULL,
    username      VARCHAR(60)  NOT NULL UNIQUE,
    email         VARCHAR(150) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,           -- store a HASH, never the raw password
    role          VARCHAR(20)  NOT NULL
                  -- No 'doctor'. There is no doctor at this clinic; the role was
                  -- removed 2026-09-04 (db/migrations/2026-09-04-remove-doctor-role.js).
                  CONSTRAINT users_role_allowed
                  CHECK (role IN ('nurse','facilitator','recorder','admin')),
    status        VARCHAR(10)  NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);


-- 2) PATIENTS — demographics + designated family contact + minor/guardian -------
CREATE TABLE patients (
    patient_id              SERIAL PRIMARY KEY,
    patient_number          VARCHAR(30) NOT NULL UNIQUE,   -- human-facing unique ID e.g. 'SAMP-2026-0001'
    full_name               VARCHAR(150) NOT NULL,
    birthdate               DATE,
    sex                     VARCHAR(10) CHECK (sex IN ('male','female')),
    address                 VARCHAR(255),
    contact_number          VARCHAR(20),                   -- nullable: some patients have no phone
    email                   VARCHAR(150),                  -- nullable: for email reminders (M4.5)

    -- close-family fallback (used when patient has no phone/email)
    family_contact_name     VARCHAR(150),
    family_contact_relation VARCHAR(50),
    family_contact_number   VARCHAR(20),
    family_email            VARCHAR(150),

    -- extra safeguards for minors (panel requirement)
    is_minor                BOOLEAN NOT NULL DEFAULT false,
    guardian_name           VARCHAR(150),
    guardian_consent        BOOLEAN NOT NULL DEFAULT false,

    -- household grouping + Data Privacy Act disclosure (v1 update)
    family_number           VARCHAR(30),
    privacy_consent         BOOLEAN NOT NULL DEFAULT false,

    created_by              INTEGER REFERENCES users(user_id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- 3) PATIENT_ACCOUNTS — patient PORTAL login (separate from staff users) --------
CREATE TABLE patient_accounts (
    account_id      SERIAL PRIMARY KEY,
    patient_id      INTEGER NOT NULL UNIQUE REFERENCES patients(patient_id) ON DELETE CASCADE,
    username        VARCHAR(60) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    valid_id_type   VARCHAR(50),                   -- e.g. 'National ID', 'PhilHealth'
    valid_id_number VARCHAR(60),
    is_verified     BOOLEAN NOT NULL DEFAULT false, -- staff confirms the valid ID
    recovery_id     VARCHAR(60),                    -- unused since v1.2 (patient-held recovery codes were dropped)
    -- Password state. Only the hash above is stored, so the temporary password
    -- can never be shown a second time; these say what HAPPENED to it, which is
    -- what staff actually need to see on the patient page.
    temp_issued_at      TIMESTAMPTZ,                -- last time staff issued a temporary password
    temp_issued_by      INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    password_changed_at TIMESTAMPTZ,                -- when the patient last set their own
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- 4) SERVICES — the 3 fixed clinic services ------------------------------------
CREATE TABLE services (
    service_id    SERIAL PRIMARY KEY,
    name          VARCHAR(50) NOT NULL UNIQUE,
    schedule_day  VARCHAR(15),                      -- 'Tuesday', 'Thursday', 'Friday'
    description   VARCHAR(255)
);


-- 5) APPOINTMENTS — scheduling + the daily list + attendance status ------------
CREATE TABLE appointments (
    appointment_id   SERIAL PRIMARY KEY,
    patient_id       INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    service_id       INTEGER NOT NULL REFERENCES services(service_id),
    appointment_date DATE NOT NULL,
    appointment_time TIME,
    status           VARCHAR(12) NOT NULL DEFAULT 'scheduled'
                     CHECK (status IN ('scheduled','completed','missed','cancelled')),
    notes            VARCHAR(255),
    created_by       INTEGER REFERENCES users(user_id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Speeds up the "who is expected today/tomorrow?" query (your daily list).
CREATE INDEX idx_appointments_date_status ON appointments (appointment_date, status);


-- 6) VISITS — the actual EMR record per visit (vitals, diagnosis, notes) --------
CREATE TABLE visits (
    visit_id          SERIAL PRIMARY KEY,
    patient_id        INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    appointment_id    INTEGER REFERENCES appointments(appointment_id), -- nullable: walk-ins
    visit_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    bp_systolic       INTEGER,
    bp_diastolic      INTEGER,
    weight_kg         NUMERIC(5,2),
    height_cm         NUMERIC(5,2),
    temperature_c     NUMERIC(4,1),
    -- One of lib/illnesses.js. The coarse bucket the seasonal report groups
    -- by; `diagnosis` below stays free text for what the nurse actually means.
    diagnosis_category VARCHAR(60),
    diagnosis         TEXT,
    consultation_notes TEXT,
    attended_by       INTEGER REFERENCES users(user_id),   -- nurse/facilitator
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_visits_patient ON visits (patient_id);
CREATE INDEX idx_visits_category_date ON visits (diagnosis_category, visit_date);


-- 7) MEDICINES — inventory stock ------------------------------------------------
CREATE TABLE medicines (
    medicine_id         SERIAL PRIMARY KEY,
    name                VARCHAR(150) NOT NULL,
    description         VARCHAR(255),
    unit                VARCHAR(30),                 -- 'tablet','vial','bottle'
    dosage              VARCHAR(30),                 -- '500mg', '2g' — distinguishes same-named medicines
    stock_quantity      INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER NOT NULL DEFAULT 10, -- flag when stock drops below this
    source              VARCHAR(150),                -- hospital / pharmacy it came from
    requires_doctor_approval BOOLEAN NOT NULL DEFAULT false, -- gates dispensing behind doctor sign-off (M6)
    is_family_planning  BOOLEAN NOT NULL DEFAULT false, -- feeds the Family Planning Acceptors report
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- 8) MEDICINE_DISPENSES — who got what, + the DOCTOR'S APPROVAL (panel point) ---
CREATE TABLE medicine_dispenses (
    dispense_id              SERIAL PRIMARY KEY,
    patient_id               INTEGER NOT NULL REFERENCES patients(patient_id),
    medicine_id              INTEGER NOT NULL REFERENCES medicines(medicine_id),
    visit_id                 INTEGER REFERENCES visits(visit_id),
    quantity                 INTEGER NOT NULL CHECK (quantity > 0),
    dispensed_by             INTEGER REFERENCES users(user_id),
    requires_doctor_approval BOOLEAN NOT NULL DEFAULT false,
    approved_by              INTEGER REFERENCES users(user_id),  -- the visiting doctor
    approved_at              TIMESTAMPTZ,
    dispensed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes                    VARCHAR(255)
);
-- (Your app subtracts `quantity` from medicines.stock_quantity when a dispense is saved.)


-- 9) IMMUNIZATION_RECORDS — child dose tracking ("5 scheduled, 1 came") ---------
CREATE TABLE immunization_records (
    imm_id          SERIAL PRIMARY KEY,
    patient_id      INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    vaccine_name    VARCHAR(100) NOT NULL,
    dose_number     INTEGER,
    scheduled_date  DATE,
    given_date      DATE,
    status          VARCHAR(12) NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','given','missed')),
    administered_by INTEGER REFERENCES users(user_id),
    remarks         VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- 10) NOTIFICATIONS — log of every SMS/email reminder sent ----------------------
CREATE TABLE notifications (
    notification_id     SERIAL PRIMARY KEY,
    patient_id          INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    appointment_id      INTEGER REFERENCES appointments(appointment_id),
    channel             VARCHAR(10) NOT NULL CHECK (channel IN ('sms','email')),
    recipient           VARCHAR(150) NOT NULL,        -- the number/email actually used
    recipient_type      VARCHAR(10) NOT NULL DEFAULT 'patient'
                        CHECK (recipient_type IN ('patient','family')),
    message             TEXT,
    status              VARCHAR(10) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','sent','failed')),
    provider_message_id VARCHAR(60),                  -- e.g. Semaphore's message_id
    provider_response   TEXT,
    sent_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_status ON notifications (status);

CREATE INDEX idx_patients_family_number ON patients (family_number);


-- 11) AUDIT_LOG — who did what, when (role accountability, panel requirement) ----
CREATE TABLE audit_log (
    audit_id     SERIAL PRIMARY KEY,
    user_id      INTEGER REFERENCES users(user_id),
    action       VARCHAR(40) NOT NULL,
    entity_type  VARCHAR(30),
    entity_id    INTEGER,
    details      VARCHAR(255),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_created ON audit_log (created_at DESC);


-- 12) PRENATAL_RECORDS — one row per pregnancy; matches the barangay's paper --
-- "Pre-Natal Record" chart (intake: husband info, G/P/LMP/EDD, lab results,
-- family history, tetanus doses). PhilHealth number intentionally left out —
-- not tracked anywhere in this system (same call as the Senior Citizen report).
CREATE TABLE prenatal_records (
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
);
CREATE INDEX idx_prenatal_records_patient ON prenatal_records (patient_id);


-- 13) PRENATAL_CHILDREN — the delivery-history table on the same paper form -----
CREATE TABLE prenatal_children (
    child_id           SERIAL PRIMARY KEY,
    prenatal_id         INTEGER NOT NULL REFERENCES prenatal_records(prenatal_id) ON DELETE CASCADE,
    child_number        INTEGER NOT NULL,
    dob                 DATE,
    sex                 VARCHAR(10),
    delivery_type       VARCHAR(20),
    attended_by_text    VARCHAR(100),
    place_of_birth      VARCHAR(150)
);


-- 14) PRENATAL_VISITS — repeatable per-visit follow-ups (AOG, BP, weight, ------
-- fundal height, FHT, symptom checklist) — the second half of the paper form.
CREATE TABLE prenatal_visits (
    visit_id                SERIAL PRIMARY KEY,
    prenatal_id             INTEGER NOT NULL REFERENCES prenatal_records(prenatal_id) ON DELETE CASCADE,
    visit_date               DATE NOT NULL DEFAULT CURRENT_DATE,
    aog                      VARCHAR(30),
    bp                       VARCHAR(20),
    weight_kg                NUMERIC(5,2),
    fundal_height_cm         NUMERIC(5,2),
    fetal_heart_tone         VARCHAR(20),
    abdominal_contractions   BOOLEAN NOT NULL DEFAULT false,
    vaginal_spotting         BOOLEAN NOT NULL DEFAULT false,
    vaginal_discharge        BOOLEAN NOT NULL DEFAULT false,
    dysuria                  BOOLEAN NOT NULL DEFAULT false,
    low_back_pain             BOOLEAN NOT NULL DEFAULT false,
    hypogastric_pain         BOOLEAN NOT NULL DEFAULT false,
    edema                    BOOLEAN NOT NULL DEFAULT false,
    notes                    VARCHAR(500),
    recorded_by              INTEGER REFERENCES users(user_id),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prenatal_visits_record ON prenatal_visits (prenatal_id);


-- ---- Seed the 3 services so the app has something to point at -----------------
INSERT INTO services (name, schedule_day, description) VALUES
  ('immunization',        'Tuesday',  'Child immunization / vaccination day'),
  ('prenatal',            'Thursday', 'Prenatal check-ups for pregnant patients'),
  ('medicine_distribution','Friday',  'Maintenance medicine distribution (e.g., hypertension)');
