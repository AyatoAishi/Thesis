// ============================================================================
// lib/medicineName.js — keeping the strength out of the name.
//
// The bug this exists for, from the live database as it stood on 2026-09-23:
//
//   Amlodipine          dosage="10"    unit="tabletgfg"
//   Amlodipine 10mg     dosage=null    unit="tablet"
//   Amlodipine 10mg     dosage="10"    unit="tabletgfg"
//
// Three rows, one medicine. The existing duplicate check compares name and
// dosage exactly, and it fired on none of these, because "Amlodipine" and
// "Amlodipine 10mg" are honestly different strings.
//
// That is not a validation gap. It is one fact with two homes: the strength
// lives inside `name` AND in `dosage`, so the two can disagree, and eventually
// they always do. No amount of checking fixes a schema that stores something
// twice — the fix is to decide which column owns it.
//
// `dosage` owns it. `name` is the medicine: "Amlodipine". The two are joined
// back together whenever a human reads them.
// ============================================================================

// A strength at the END of a name: "500mg", "10 mg", "2g", "5ml", "400 mcg",
// "1000 IU", "0.5%". Anchored to the end on purpose — a number in the middle
// is usually part of the name itself ("Vitamin B-Complex", "Co-amoxiclav
// 625"), and guessing at those would rewrite names nobody asked us to touch.
const TRAILING_DOSE = /[\s,(-]*\b(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|l|iu|%|mg\/ml)\b\s*\)?\s*$/i;

// Does this name carry its own strength? Returns the suggested split, or null.
function splitDose(name) {
  const raw = String(name || "").trim();
  const m = raw.match(TRAILING_DOSE);
  if (!m) return null;
  const base = raw.slice(0, m.index).replace(/[\s,(-]+$/, "").trim();
  // "500mg" on its own is not a medicine with a strength, it is just a
  // strength — leave it alone rather than produce an empty name.
  if (!base) return null;
  return { name: base, dosage: `${m[1]}${m[2].toLowerCase()}` };
}

// A dosage the user typed with no unit — "10" instead of "10mg" — is the other
// half of the same problem: it cannot be compared against "10mg" and it cannot
// be read aloud. Returns the value unchanged when it already carries a unit.
function dosageNeedsUnit(dosage) {
  const d = String(dosage || "").trim();
  if (!d) return false;
  return /^\d+(\.\d+)?$/.test(d);
}

module.exports = { splitDose, dosageNeedsUnit, TRAILING_DOSE };
