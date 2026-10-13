// ============================================================================
// db/migrations/2026-10-13-patient-photos.js
//
// Panel review, Oct 2026: an optional profile photo, added by the PATIENT on
// the portal (staff do not take or upload one). Staff see it on the patient's
// page, which helps put a face to the record at the desk.
//
// Its own table rather than a column on patients: every patient list, search
// and report reads `patients`, and none of them should drag an image along.
// One row per patient at most; the photo is a small JPEG (resized on the
// patient's own phone before upload), stored as bytes. Deleting the patient
// deletes the photo.
//
// Run BEFORE the new code goes live (the new pages read this table).
// Run: node db/migrations/2026-10-13-patient-photos.js   (safe to run twice)
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS patient_photos (
      patient_id INTEGER PRIMARY KEY REFERENCES patients(patient_id) ON DELETE CASCADE,
      mime       VARCHAR(20) NOT NULL CHECK (mime IN ('image/jpeg', 'image/png')),
      data       BYTEA NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  console.log("OK: patient_photos ready.");
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
