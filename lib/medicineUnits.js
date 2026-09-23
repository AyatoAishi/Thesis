// ============================================================================
// lib/medicineUnits.js — what a medicine can be counted in.
//
// A free-text box used to sit here, and the live database is the argument for
// this file: two of eleven medicines were stocked in "tabletgfg". Nobody meant
// to type that, and nothing stopped them — and a typo in a unit is not
// cosmetic, it splits one medicine into two lines that never add up again.
//
// A fixed list, not a list with "Other…". The whole point is that the set of
// units at a barangay health station is small and known; the moment free text
// is reachable the typo is reachable, and a unit that exists once is not a
// unit, it is a mistake with a row of its own.
//
// If the clinic genuinely stocks something that is not here, the honest fix is
// to add it to this list — which is a one-line edit and a deploy, and leaves
// every other record spelled the same way.
// ============================================================================
const UNITS = [
  "tablet",
  "capsule",
  "vial",
  "ampule",
  "bottle",
  "sachet",
  "tube",
  "syrup",
  "suppository",
  "piece",
];

// Anything already saved that is not on the list — "tabletgfg", or a unit added
// before this file existed — still has to round-trip, or editing an old
// medicine for an unrelated reason would silently change its unit. It shows up
// on the dropdown marked as needing a fix, so it can be corrected on purpose
// rather than by accident.
function optionsFor(current) {
  const cur = (current || "").trim();
  const known = UNITS.map((u) => ({ value: u, label: u, legacy: false }));
  if (cur && !UNITS.includes(cur.toLowerCase())) {
    known.unshift({ value: cur, label: `${cur} — hindi tama, palitan`, legacy: true });
  }
  return known;
}

const isKnown = (u) => UNITS.includes(String(u || "").trim().toLowerCase());

module.exports = { UNITS, optionsFor, isKnown };
