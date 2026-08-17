// ============================================================================
// lib/sessions.js — ending OTHER sessions belonging to the same account.
//
// Two situations need this:
//
//   1. Someone signs in to an account that is already signed in somewhere else.
//      A staff account is meant to be one person — the admin account especially
//      — so the older sign-in gives way to the newer one. Sharing an account
//      then becomes visible instead of silent, which is the point: the activity
//      log can only name a person if each person has their own account.
//
//   2. A password changed. People change a password precisely when they think
//      someone else is using the account, so leaving that browser signed in
//      with a session obtained under the old password makes the change
//      meaningless.
//
// Sessions are rows in the `session` table (connect-pg-simple), holding a json
// blob with the staff user under sess->'user' and the portal patient under
// sess->'patient'.
//
// The row is MARKED rather than deleted. Deleting drops the browser back at the
// sign-in page with no explanation, which reads like an expired session and
// sends people looking for a bug. The mark is read on that browser's next
// request (see server.js), which then ends the session properly and says why.
// Security-wise the two are equivalent: nothing can be done with the session
// once the mark is there.
// ============================================================================
const db = require("../db");

// Reasons, kept here so server.js and the sign-in page agree on the wording.
const REASONS = {
  taken: "signed-in-elsewhere",
  password: "password-changed",
};

// Never throws. Failing to tidy up other sessions must not turn a successful
// sign-in or password change into an error page.
async function markOthers({ column, key, id, keepSid, reason }) {
  try {
    const { rowCount } = await db.query(
      `UPDATE session
          SET sess = jsonb_set(sess::jsonb, '{endedBecause}', to_jsonb($4::text))::json
        WHERE sid <> $1
          AND (sess::jsonb -> $2 ->> $3)::int = $5
          AND (sess::jsonb ->> 'endedBecause') IS NULL`,
      [keepSid, column, key, reason, id]
    );
    return rowCount;
  } catch (e) {
    console.error("[sessions] markOthers:", e.message);
    return 0;
  }
}

const endOtherStaffSessions = (userId, keepSid, reason = REASONS.password) =>
  markOthers({ column: "user", key: "user_id", id: userId, keepSid, reason });

const endOtherPatientSessions = (patientId, keepSid, reason = REASONS.password) =>
  markOthers({ column: "patient", key: "patient_id", id: patientId, keepSid, reason });

module.exports = { endOtherStaffSessions, endOtherPatientSessions, REASONS };
