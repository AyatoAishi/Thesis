// ============================================================================
// lib/names.js — a patient's name in three parts (Sept 29 review).
//
// The form asks for First / Middle / Last; full_name is BUILT from them on every
// save and stays the column the rest of the system reads (lists, search,
// reports, PDFs, the portal). See db/migrations/2026-09-29-patient-name-parts.js
// for why the parts sit beside full_name instead of replacing it.
// ============================================================================
const MAX = 80;

// Trim, collapse inner whitespace, cap the length. "  Maria   Clara " -> "Maria Clara".
function clean(s) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, MAX);
}

// First Middle Last, skipping whatever is empty.
function compose({ first, middle, last }) {
  return [first, middle, last].map(clean).filter(Boolean).join(" ");
}

// Words that belong to the surname that follows them: Dela Cruz, De Guzman,
// Delos Santos, San Jose, Del Rosario.
const PARTICLES = new Set([
  "de", "del", "dela", "della", "delos", "de los", "des", "di", "do", "dos", "du",
  "la", "las", "le", "los", "san", "santa", "santo", "sta.", "sto.", "sta", "sto",
  "van", "von", "der", "den", "mac", "mc",
]);
const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
const INITIAL = /^[A-Za-z]{1,2}\.$|^[A-Za-z]$/;

// A best guess at the parts of a name saved before the form had three fields.
// Only ever used to PRE-FILL the edit form for a person to check; it is never
// written anywhere on its own. Unsure cases lean on the first name:
//   "Maria Clara Dela Cruz"      -> Maria Clara / — / Dela Cruz
//   "Richelle Pearl B. Gonzales" -> Richelle Pearl / B. / Gonzales
//   "Juan Dela Cruz Jr."         -> Juan / — / Dela Cruz Jr.
//   "pedro"                      -> pedro / — / —   (staff type the last name)
function guessParts(full) {
  const words = clean(full).split(" ").filter(Boolean);
  if (!words.length) return { first: "", middle: "", last: "" };
  if (words.length === 1) return { first: words[0], middle: "", last: "" };

  let suffix = "";
  if (words.length > 2 && SUFFIX.test(words[words.length - 1])) suffix = words.pop();

  // The surname is the last word plus any particles directly in front of it —
  // never the very first word, which is always (part of) the first name.
  let start = words.length - 1;
  while (start - 1 >= 1 && PARTICLES.has(words[start - 1].toLowerCase())) start--;
  const last = [...words.slice(start), suffix].filter(Boolean).join(" ");
  const rest = words.slice(0, start);

  // A middle initial ("B.") is the one thing that can be read reliably.
  let middle = "";
  if (rest.length >= 2 && INITIAL.test(rest[rest.length - 1])) middle = rest.pop();
  return { first: rest.join(" "), middle, last };
}

module.exports = { MAX, clean, compose, guessParts };
