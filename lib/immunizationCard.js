// ============================================================================
// lib/immunizationCard.js — cross-references the standard DOH schedule in
// lib/vaccines.js against the doses actually recorded for one patient.
//
// Lives here rather than in routes/immunization.js because the patient portal
// renders the same card read-only — one source of truth for "which doses does
// this person have, and which are still empty".
// ============================================================================
const db = require("../db");
const VACCINES = require("./vaccines");

// Returns { schedule, other }:
//   schedule — every catalog vaccine with a doseSlots array (given or not)
//   other    — recorded doses whose vaccine isn't on the catalog at all
//              (vaccine_name is free text, which is what makes "Other" work)
async function buildCard(patientId) {
  const { rows } = await db.query(
    `SELECT imm_id, vaccine_name, dose_number, given_date, remarks
       FROM immunization_records
      WHERE patient_id=$1 AND status='given'
      ORDER BY given_date`,
    [patientId]
  );

  const byVaccine = new Map();
  rows.forEach((r) => {
    if (!byVaccine.has(r.vaccine_name)) byVaccine.set(r.vaccine_name, new Map());
    byVaccine.get(r.vaccine_name).set(r.dose_number, r);
  });

  const catalogNames = new Set(VACCINES.map((v) => v.name));
  const schedule = VACCINES.map((v) => ({
    ...v,
    doseSlots: Array.from({ length: v.doses }, (_, i) => {
      const doseNumber = i + 1;
      const rec = byVaccine.get(v.name)?.get(doseNumber);
      return rec
        ? { doseNumber, given: true, date: rec.given_date, remarks: rec.remarks, imm_id: rec.imm_id }
        : { doseNumber, given: false };
    }),
  }));

  const other = rows.filter((r) => !catalogNames.has(r.vaccine_name));

  return { schedule, other };
}

module.exports = { buildCard };
