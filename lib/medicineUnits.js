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
  "suppository",
  "condom",
  "vial",
  "ampule",
  "bottle",
  "sachet",
  "tube",
  "syrup",        // only on records from before the categories (now Bottle › Syrup)
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

// ---- category -> subcategory (panel, Oct 2026) --------------------------------
// "Gawing main category ang bottle, box, etc. then subcategory ang syrup,
// tablet." The CATEGORY is what it comes in; the SUBCATEGORY is what it is.
// Underneath it is the same three columns as before, so stock, restock,
// dispensing and reports are untouched:
//   - a countable form (tablet, capsule…) in a box / strip / pack / bottle:
//       unit = the form, package_unit = the category, "1 box = N tablets";
//       stock is counted in tablets.
//   - a countable form loose (category Piece): unit = the form, no package.
//   - anything else (syrup in a bottle, ointment in a tube, an injection in a
//       vial): unit = the category; stock is counted in bottles / tubes / vials.
// `form` keeps the subcategory itself (db/migrations/2026-10-17-medicine-form.js).
const CATEGORIES = {
  box:    { label: "Box",            forms: ["tablet", "capsule", "suppository", "condom"] },
  strip:  { label: "Strip (banig)",  forms: ["tablet", "capsule"] },
  pack:   { label: "Pack",           forms: ["tablet", "capsule", "condom"] },
  bottle: { label: "Bottle",         forms: ["syrup", "suspension", "drops", "solution", "tablet", "capsule"] },
  tube:   { label: "Tube",           forms: ["ointment", "cream", "gel"] },
  vial:   { label: "Vial",           forms: ["injection", "vaccine"] },
  ampule: { label: "Ampule",         forms: ["injection"] },
  sachet: { label: "Sachet",         forms: ["powder", "oral rehydration salts", "granules"] },
  piece:  { label: "Piece (loose)",  forms: ["tablet", "capsule", "suppository", "condom", "device"] },
};
// Given out one by one, so a container of them is a package of N.
const COUNTABLE = ["tablet", "capsule", "suppository", "condom"];
const FORM_LABELS = { "oral rehydration salts": "Oral rehydration salts (ORS)", device: "Device (IUD, implant…)" };
const formLabel = (f) => FORM_LABELS[f] || (f ? f.charAt(0).toUpperCase() + f.slice(1) : "");

// Category + subcategory (+ how many in one) -> the stored columns, or an error.
function fromChoice(category, form, perPkg) {
  const cat = String(category || "").trim().toLowerCase();
  const fm = String(form || "").trim().toLowerCase();
  if (!CATEGORIES[cat]) return { error: "Choose a category (what it comes in)." };
  if (!CATEGORIES[cat].forms.includes(fm))
    return { error: `Choose a subcategory that fits ${CATEGORIES[cat].label.toLowerCase()}.` };
  if (COUNTABLE.includes(fm) && cat !== "piece") {
    const n = parseInt(perPkg, 10);
    if (!(n >= 2 && n <= 10000))
      return { error: `Say how many ${plural(fm)} are in one ${cat === "strip" ? "strip" : cat} — a whole number from 2 to 10,000.` };
    return { unit: fm, package_unit: cat, pieces_per_package: n, form: fm };
  }
  if (COUNTABLE.includes(fm)) return { unit: fm, package_unit: null, pieces_per_package: null, form: fm };
  if (fm === "device") return { unit: "piece", package_unit: null, pieces_per_package: null, form: fm };
  return { unit: cat, package_unit: null, pieces_per_package: null, form: fm };
}

// The stored columns -> category + subcategory, for the edit form and labels.
function toChoice(m) {
  if (!m) return { category: "", form: "" };
  if (m.category && CATEGORIES[m.category]) return { category: m.category, form: m.form || "" };
  const unit = String(m.unit || "").toLowerCase();
  if (m.package_unit && CATEGORIES[m.package_unit]) return { category: m.package_unit, form: m.form || unit };
  if (COUNTABLE.includes(unit)) return { category: "piece", form: unit };
  if (unit === "piece") return { category: "piece", form: m.form || "device" };
  if (unit === "syrup") return { category: "bottle", form: "syrup" };
  if (CATEGORIES[unit]) return { category: unit, form: m.form || CATEGORIES[unit].forms[0] };
  return { category: "", form: "" };
}

// "Tablet · Box of 100", "Syrup · Bottle", "Tablet · loose".
function kindLabel(m) {
  const c = toChoice(m);
  if (!c.category) return m && m.unit ? m.unit : "—";
  const per = perPackage(m);
  const where = c.category === "piece" ? "loose"
    : per ? `${CATEGORIES[c.category].label.replace(/ \(.*\)$/, "")} of ${per}` : CATEGORIES[c.category].label;
  return `${formLabel(c.form)} · ${where}`;
}

module.exports = {
  CATEGORIES, COUNTABLE, formLabel, fromChoice, toChoice, kindLabel,
  UNITS, optionsFor, isKnown, PACKAGES, isPackage, plural, perPackage, inPackages };
