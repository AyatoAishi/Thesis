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

module.exports = { ID_TYPES, UNVERIFIED };
