// ============================================================================
// middleware/portalAuth.js — patient-portal session gate (M5)
// Patients live in req.session.patient (separate from staff req.session.user),
// so a staff member and a test patient can be signed in from the same browser
// without clobbering each other. RA 10173: portal queries must ALWAYS key off
// the session's patient_id — never a URL param.
// ============================================================================
function requirePatient(req, res, next) {
  if (req.session && req.session.patient) return next();
  return res.redirect("/portal/login");
}

module.exports = { requirePatient };
