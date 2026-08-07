// Standard DOH immunization schedule, matching the "Todo Ligtas" card Alyanna
// photographed. Kept as a plain list (not a database table) — immunization_records
// already stores vaccine_name as free text, so a patient's own history stays
// intact even for a vaccine that isn't on this list (recorded under "Other").
module.exports = [
  { name: "BCG Vaccine", category: "infant", schedule: "At birth", doses: 1 },
  { name: "Hepatitis B Vaccine", category: "infant", schedule: "At birth", doses: 1 },
  { name: "Pentavalent Vaccine (DPT-Hep B-HIB)", category: "infant", schedule: "1½, 2½, 3½ months", doses: 3 },
  { name: "Oral Polio Vaccine (OPV)", category: "infant", schedule: "1½, 2½, 3½ months", doses: 3 },
  { name: "Inactivated Polio Vaccine (IPV)", category: "infant", schedule: "3½ & 9 months", doses: 2 },
  { name: "Pneumococcal Conjugate Vaccine (PCV)", category: "infant", schedule: "1½, 2½, 3½ months", doses: 3 },
  { name: "Measles, Mumps, Rubella Vaccine (MMR)", category: "infant", schedule: "9 months & 1 year", doses: 2 },
  { name: "Measles Containing Vaccine (MCV) — Grade 1", category: "school", schedule: "Grade 1", doses: 1 },
  { name: "Measles Containing Vaccine (MCV) — Grade 7", category: "school", schedule: "Grade 7", doses: 1 },
  { name: "Tetanus Diphtheria (TD)", category: "school", schedule: "Grade 1 & 7", doses: 2 },
  { name: "Human Papillomavirus Vaccine", category: "school", schedule: "Grade 4, female 9–14 y/o", doses: 2 },
  { name: "Influenza Vaccine", category: "senior", schedule: "Senior citizen (annual)", doses: 5 },
  { name: "Pneumococcal Vaccine", category: "senior", schedule: "Senior citizen", doses: 2 },
];
