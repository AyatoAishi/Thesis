// ============================================================================
// lib/idTypes.js — valid-ID choices for portal account verification, shared by
// the guided new-account step and the account card on the patient profile.
//
// UNVERIFIED is not one of them. It is the sentinel the form submits when the
// patient is standing at the desk with no ID on them, which is common enough
// that refusing to make the account was the wrong answer: the account gets
// created unverified instead, sees only the parts of the portal that carry no
// health information, and waits for a staff member to check an ID and press
// Verify. Nothing is stored under this value — the ID columns stay NULL, so
// "no ID on file" and "an ID called No ID" never get confused.
// ============================================================================
const ID_TYPES = [
  "National ID (PhilSys)",
  "PhilHealth ID",
  "UMID",
  "Driver's License",
  "Voter's ID",
  "Postal ID",
  "Barangay ID",
  "Senior Citizen ID",
  "Student ID",
  "Other government ID",
];

const UNVERIFIED = "__no_id__";

// What each ID's number looks like, so the box shows a believable example and
// stops at a sensible length (Oct 2026 review: one generic box for every ID).
// `max` is also enforced on the server. Where the format varies by office
// (barangay, OSCA, school), the example says so instead of inventing one.
const ID_FORMATS = {
  "National ID (PhilSys)": { placeholder: "e.g. 1234-5678-9012-3456 (16 digits)", max: 19 },
  "PhilHealth ID":         { placeholder: "e.g. 12-345678901-2 (12 digits)",       max: 14 },
  "UMID":                  { placeholder: "e.g. 0111-2345678-9 (CRN, 12 digits)",  max: 14 },
  "Driver's License":      { placeholder: "e.g. N01-23-456789",                     max: 13 },
  "Voter's ID":            { placeholder: "VIN as printed on the ID",              max: 30 },
  "Postal ID":             { placeholder: "PRN as printed on the ID",              max: 20 },
  "Barangay ID":           { placeholder: "Number as printed on the ID",           max: 20 },
  "Senior Citizen ID":     { placeholder: "OSCA number as printed on the ID",      max: 20 },
  "Student ID":            { placeholder: "e.g. 2026-00123",                        max: 20 },
  "Other government ID":   { placeholder: "Number as printed on the ID",           max: 30 },
};

// Server-side twin of the form's maxlength. Returns an error message or null.
function idNumberProblem(type, number) {
  const f = ID_FORMATS[type];
  if (f && String(number || "").length > f.max)
    return `That ${type} number is too long — it has at most ${f.max} characters.`;
  return null;
}

module.exports = { ID_TYPES, UNVERIFIED, ID_FORMATS, idNumberProblem };
