// ============================================================================
// lib/vaccines.js — the standard DOH immunization schedule, matching the
// "Todo Ligtas" card Alyanna photographed. Kept as a plain list (not a database
// table) — immunization_records already stores vaccine_name as free text, so a
// patient's own history stays intact even for a vaccine that isn't on this
// list (recorded under "Other").
//
// `dueWeeks` is what turns this list from a printed card into something the
// system can act on: the age, in weeks, at which each dose comes due. Weeks and
// not months, because the DOH schedule itself is written in weeks — the "1½,
// 2½, 3½ months" on the card is 6, 10 and 14 weeks, and rounding that back
// through calendar months moves the date by days in either direction depending
// on which month the child was born in. 9 months is taken as 39 weeks and one
// year as 52; a barangay session runs once a week, so nothing here is precise
// to the day anyway.
//
// Only the infant series carries `dueWeeks`. A Grade 1 shot is due when a child
// enrols in Grade 1, which is not an age this system knows, and the senior
// influenza dose is annual rather than once. Those stay on the card and stay
// recorded by hand — inventing a birthday-derived due date for them would
// produce confident, wrong reminders.
// ============================================================================
module.exports = [
  { name: "BCG Vaccine", category: "infant", schedule: "At birth", doses: 1, dueWeeks: [0] },
  { name: "Hepatitis B Vaccine", category: "infant", schedule: "At birth", doses: 1, dueWeeks: [0] },
  { name: "Pentavalent Vaccine (DPT-Hep B-HIB)", category: "infant", schedule: "1½, 2½, 3½ months", doses: 3, dueWeeks: [6, 10, 14] },
  { name: "Oral Polio Vaccine (OPV)", category: "infant", schedule: "1½, 2½, 3½ months", doses: 3, dueWeeks: [6, 10, 14] },
  { name: "Inactivated Polio Vaccine (IPV)", category: "infant", schedule: "3½ & 9 months", doses: 2, dueWeeks: [14, 39] },
  { name: "Pneumococcal Conjugate Vaccine (PCV)", category: "infant", schedule: "1½, 2½, 3½ months", doses: 3, dueWeeks: [6, 10, 14] },
  { name: "Measles, Mumps, Rubella Vaccine (MMR)", category: "infant", schedule: "9 months & 1 year", doses: 2, dueWeeks: [39, 52] },
  { name: "Measles Containing Vaccine (MCV) — Grade 1", category: "school", schedule: "Grade 1", doses: 1 },
  { name: "Measles Containing Vaccine (MCV) — Grade 7", category: "school", schedule: "Grade 7", doses: 1 },
  { name: "Tetanus Diphtheria (TD)", category: "school", schedule: "Grade 1 & 7", doses: 2 },
  { name: "Human Papillomavirus Vaccine", category: "school", schedule: "Grade 4, female 9–14 y/o", doses: 2 },
  { name: "Influenza Vaccine", category: "senior", schedule: "Senior citizen (annual)", doses: 5 },
  { name: "Pneumococcal Vaccine", category: "senior", schedule: "Senior citizen", doses: 2 },
];
