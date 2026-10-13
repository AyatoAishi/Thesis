// ============================================================================
// lib/prenatalSymptoms.js — the "Others" symptoms on prenatal intake and
// check-up forms (panel review, Oct 2026).
//
// The seven printed on the paper form keep their own yes/no columns. Anything
// else staff type under "Others" is kept on the record (other_symptoms) and
// added to prenatal_symptom_options, so it appears as a checkbox on every
// later form instead of being typed again — and spelled differently — each
// time. See db/migrations/2026-10-13-prenatal-other-symptoms.js.
// ============================================================================
const db = require("../db");

const FIXED = [
  "Abdominal contractions", "Vaginal spotting", "Vaginal discharge", "Dysuria",
  "Low back pain", "Hypogastric pain", "Edema",
];
const MAX_LEN = 80;
const MAX_PER_RECORD = 12;

const tidy = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, MAX_LEN);

// The options staff have added so far, A–Z. Never throws: a form still opens
// (with only the seven) if this one small query fails.
async function options() {
  try {
    const { rows } = await db.query("SELECT label FROM prenatal_symptom_options ORDER BY lower(label)");
    return rows.map((r) => r.label);
  } catch (e) {
    console.error("[prenatal symptoms]", e.message);
    return [];
  }
}

// From a submitted form: the ticked "Others" checkboxes (sx_other, one or
// many) plus anything typed in the "Others" box (sx_other_new, separated by
// commas or new lines). One entry per symptom regardless of capitals; the
// seven fixed ones are left to their own checkboxes.
function read(body) {
  const ticked = [].concat(body.sx_other || []);
  const typed = String(body.sx_other_new || "").split(/[,;\n]/);
  const seen = new Set(FIXED.map((f) => f.toLowerCase()));
  const out = [];
  for (const raw of ticked.concat(typed)) {
    const label = tidy(raw);
    if (label.length < 2 || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
    if (out.length >= MAX_PER_RECORD) break;
  }
  return out;
}

// Adds any new ones to the shared list. Existing options (any capitals) stay.
async function remember(labels, userId) {
  for (const label of labels) {
    await db.query(
      `INSERT INTO prenatal_symptom_options (label, created_by) VALUES ($1, $2)
       ON CONFLICT ((lower(label))) DO NOTHING`,
      [label, userId || null]
    );
  }
}

module.exports = { FIXED, options, read, remember, MAX_LEN };
