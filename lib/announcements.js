// ============================================================================
// lib/announcements.js — what the clinic is telling patients right now.
//
// One query, used by the patient portal, the public About page and the staff
// dashboard, so all three always agree on what "showing now" means: started
// on or before today (Manila) and not yet past its last day.
// ============================================================================
const db = require("../db");
const F = require("./format");

const TITLE_MAX = 120;
const BODY_MAX = 1000;

async function active() {
  const today = F.manilaToday();
  const { rows } = await db.query(
    `SELECT announcement_id, title, body,
            to_char(starts_on, 'YYYY-MM-DD') AS starts_on,
            to_char(ends_on, 'YYYY-MM-DD') AS ends_on
       FROM announcements
      WHERE starts_on <= $1 AND (ends_on IS NULL OR ends_on >= $1)
      ORDER BY starts_on DESC, announcement_id DESC`,
    [today]
  );
  return rows;
}

// Same as active(), but never takes a page down with it: an announcement is
// extra information, and a patient who came for their appointment date must
// still get it if this one query fails.
async function activeSafe() {
  try { return await active(); } catch (e) { console.error("[announcements]", e.message); return []; }
}

module.exports = { active, activeSafe, TITLE_MAX, BODY_MAX };
