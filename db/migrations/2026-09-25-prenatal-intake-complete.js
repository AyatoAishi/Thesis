// ============================================================================
// db/migrations/2026-09-25-prenatal-intake-complete.js
//
// "FIX PRENATAL RECORD, KULANG NG PART NA TO." — the professors' review, with a
// photo of the barangay's paper PRE-NATAL RECORD. Compared field by field, the
// digital record had the check-up visits and the children table already, and
// was missing these from the paper form's intake section:
//
//   Weight, Height, PhilHealth number          (top right of the form)
//   the RESULT of each screening test          (the paper has "VDRL / DATE",
//     — pregnancy test, VDRL, HBsAg, HIV,        "HBsAg / DATE" … and only the
//       CBC, urinalysis                          dates were being stored)
//   the intake symptoms checklist              (the first block of seven
//     — abdominal contractions … edema           checkboxes, separate from the
//                                                one on each visit)
//   the intake notes                           (the handwritten notes beside
//                                                that checklist — medicines
//                                                started, referrals, remarks)
//
// Idempotent. No existing row changes; the new columns are empty/false until
// somebody fills them in.
//
// Run: node db/migrations/2026-09-25-prenatal-intake-complete.js
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  await db.query(`ALTER TABLE prenatal_records
    ADD COLUMN IF NOT EXISTS weight_kg               NUMERIC(5,1),
    ADD COLUMN IF NOT EXISTS height_cm               NUMERIC(5,1),
    ADD COLUMN IF NOT EXISTS philhealth_no           VARCHAR(20),
    ADD COLUMN IF NOT EXISTS pregnancy_test_result   VARCHAR(12),
    ADD COLUMN IF NOT EXISTS vdrl_result             VARCHAR(20),
    ADD COLUMN IF NOT EXISTS hbsag_result            VARCHAR(20),
    ADD COLUMN IF NOT EXISTS hiv_result              VARCHAR(20),
    ADD COLUMN IF NOT EXISTS cbc_result              VARCHAR(80),
    ADD COLUMN IF NOT EXISTS urinalysis_result       VARCHAR(80),
    ADD COLUMN IF NOT EXISTS sx_abdominal_contractions BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS sx_vaginal_spotting       BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS sx_vaginal_discharge      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS sx_dysuria                BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS sx_low_back_pain          BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS sx_hypogastric_pain       BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS sx_edema                  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS intake_notes            VARCHAR(1000)`);
  console.log("OK: prenatal_records has every field on the paper intake form.");
  const { rows } = await db.query("SELECT count(*)::int AS n FROM prenatal_records");
  console.log(`   ${rows[0].n} prenatal record(s) — untouched, new fields empty.`);
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
