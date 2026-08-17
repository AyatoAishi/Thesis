// ============================================================================
// middleware/portalAuth.js — patient-portal session gate (M5)
// Patients live in req.session.patient (separate from staff req.session.user),
// so a staff member and a test patient can be signed in from the same browser
// without clobbering each other. RA 10173: portal queries must ALWAYS key off
// the session's patient_id — never a URL param.
// ============================================================================
function requirePatient(req, res, next) {
  if (!req.session || !req.session.patient) return res.redirect("/portal/login");

  // A password change (their own, or a staff reset at the desk) marks every
  // other browser holding this account — see lib/sessions.js. This is where a
  // marked portal session finds out. Checked here rather than only on the staff
  // side, because otherwise the mark would sit in the row doing nothing and a
  // reset would not actually put anyone out.
  if (req.session.endedBecause) {
    return req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.redirect("/portal/login?ended=1");
    });
  }

  return next();
}

module.exports = { requirePatient };
