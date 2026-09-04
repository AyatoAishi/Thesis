// ============================================================================
// lib/illnesses.js — the presenting-condition list on the consultation form.
//
// Why a list and not just the free-text diagnosis box that was already there:
// the seasonal report has to be able to say "respiratory cases tripled in
// December". It cannot do that over free text. One nurse writes "flu", another
// "Influenza", a third "trangkaso", and a GROUP BY on the column returns three
// rows of one case each — a chart that is technically correct and tells nobody
// anything.
//
// So the free-text box stays, because it is where the actual clinical detail
// belongs ("acute upper respiratory tract infection, day 3"), and this list
// sits beside it as the coarse bucket the report counts. The nurse picks one
// and writes what they mean. Neither field replaces the other.
//
// The list is deliberately short. A hundred options is a list nobody reads to
// the bottom of, and every entry past the twentieth is a bucket with two cases
// in it a year. These are the conditions a barangay health station in this
// country actually sees, in roughly the order the DOH's leading causes of
// morbidity puts them, with the ones this clinic runs services for at the end.
// "Other" is not a failure — it is where an honest nurse puts something that
// is genuinely not on the list, and a bucket of "Other" growing month on month
// is itself the signal that this list needs a new entry.
// ============================================================================
module.exports = [
  "Acute respiratory infection (ubo, sipon)",
  "Influenza-like illness (trangkaso)",
  "Pneumonia",
  "Fever, cause not yet known (lagnat)",
  "Diarrhea / gastroenteritis (LBM)",
  "Urinary tract infection",
  "Skin disease (galis, dermatitis)",
  "Wound, burn or injury",
  "Animal bite",
  "Dengue (suspected or confirmed)",
  "Tuberculosis",
  "Hypertension",
  "Diabetes",
  "Asthma",
  "Anemia",
  "Intestinal parasitism",
  "Malnutrition / underweight",
  "Dental",
  "Prenatal / maternal check-up",
  "Well-baby / growth monitoring",
  "Family planning",
  "Other",
];
