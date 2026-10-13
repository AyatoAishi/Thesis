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
function optionsFor(current, t) {
  const cur = (current || "").trim();
  const known = UNITS.map((u) => ({ value: u, label: u, legacy: false }));
  if (cur && !UNITS.includes(cur.toLowerCase())) {
    known.unshift({ value: cur, label: t ? t("inv.legacy_unit", { u: cur }) : `${cur} — not a valid unit, change it`, legacy: true });
  }
  return known;
}

const isKnown = (u) => UNITS.includes(String(u || "").trim().toLowerCase());

// ---- packages (panel review, Oct 2026: "restock by box, give it by piece") ----
// Deliveries arrive in boxes; patients are handed tablets. A medicine may name
// the package it arrives in and how many pieces one holds. Stock is still
// counted in pieces everywhere — the package is only a way to type a delivery
// in and to read the total back the way the shelf is actually counted.
const PACKAGES = ["box", "pack", "bottle", "strip", "carton"];
const isPackage = (p) => PACKAGES.includes(String(p || "").trim().toLowerCase());

// "box" -> "boxes", "tablet" -> "tablets", "suppository" -> "suppositories".
function plural(word, n) {
  const w = String(word || "piece");
  if (n === 1) return w;
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + "ies";
  if (/(x|s|ch|sh)$/.test(w)) return w + "es";
  return w + "s";
}

// How many pieces one package holds, or 0 when the medicine has no package.
function perPackage(m) {
  const per = m && m.package_unit ? parseInt(m.pieces_per_package, 10) : 0;
  return per >= 2 ? per : 0;
}

// 320 tablets in boxes of 100 -> "3 boxes + 20 tablets"; 300 -> "3 boxes".
// null when the medicine has no package or there is less than one full one,
// because "0 boxes + 20 tablets" says nothing "20 tablets" doesn't.
function inPackages(qty, m) {
  const per = perPackage(m);
  const n = parseInt(qty, 10);
  if (!per || !(n >= per)) return null;
  const whole = Math.floor(n / per);
  const loose = n % per;
  return `${whole} ${plural(m.package_unit, whole)}` +
    (loose ? ` + ${loose} ${plural(m.unit || "piece", loose)}` : "");
}

module.exports = { UNITS, optionsFor, isKnown, PACKAGES, isPackage, plural, perPackage, inPackages };
