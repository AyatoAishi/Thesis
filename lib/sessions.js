// ============================================================================
// lib/sessions.js — reaching into the session store to end OTHER sessions.
//
// Changing a password is the one thing a person does when they believe someone
// else has their account. It has to actually mean something: without this, the
// other browser stays signed in with full access, still holding a session it
// obtained with the old password. That matters twice over here, because staff
// at a small clinic share a desk and sometimes share an account — the honest
// fix for that is one account each, but the password change should still do
// what everyone assumes it does.
//
// Sessions live in the `session` table (connect-pg-simple) as a json blob. The
// user id sits at sess -> 'user' -> 'user_id' for staff, and the patient id at
// sess -> 'patient' -> 'patient_id' for the portal. Deleting the row is what
// signs that browser out.
// ============================================================================
const db = require("../db");

// Never throws: being unable to tidy up other sessions must not turn a
// successful password change into an error page. The password itself has
// already been changed by the time this runs.
async function endOtherStaffSessions(userId, keepSid) {
  try {
    const { rowCount } = await db.query(
      `DELETE FROM session
        WHERE sid <> $1
          AND (sess::jsonb -> 'user' ->> 'user_id')::int = $2`,
      [keepSid, userId]
    );
    return rowCount;
  } catch (e) {
    console.error("[sessions] endOtherStaffSessions:", e.message);
    return 0;
  }
}

async function endOtherPatientSessions(patientId, keepSid) {
  try {
    const { rowCount } = await db.query(
      `DELETE FROM session
        WHERE sid <> $1
          AND (sess::jsonb -> 'patient' ->> 'patient_id')::int = $2`,
      [keepSid, patientId]
    );
    return rowCount;
  } catch (e) {
    console.error("[sessions] endOtherPatientSessions:", e.message);
    return 0;
  }
}

module.exports = { endOtherStaffSessions, endOtherPatientSessions };
