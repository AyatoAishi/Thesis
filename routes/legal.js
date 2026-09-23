// ============================================================================
// routes/legal.js — the privacy notice and the terms of service.
//
// Mounted ABOVE requireLogin in server.js, and that is the point of the file.
// The landing page and the patient sign-in page have claimed "your records are
// private (RA 10173)" since v1 with nothing behind the claim, and the person
// most in need of reading it is the one who has not signed in: a patient
// deciding whether to tick the consent box, and anyone checking that the
// citation is real.
//
// The consent checkbox on the patient form now links here too. Consent to a
// disclosure nobody can read is not consent — it is a tick box.
// ============================================================================
const express = require("express");
const router = express.Router();

// One date for both documents. A privacy notice has to say when it last
// changed, and a hardcoded string is honest: it moves when somebody edits the
// text, which is exactly when it should move. new Date() would claim the notice
// was revised today on every single page load.
const UPDATED = "September 23, 2026";

router.get("/privacy", (req, res) => {
  res.render("legal", {
    title: "Privacy Notice · Sampaguita HC",
    layout: false,
    doc: "privacy",
    updated: UPDATED,
  });
});

router.get("/terms", (req, res) => {
  res.render("legal", {
    title: "Terms of Service · Sampaguita HC",
    layout: false,
    doc: "terms",
    updated: UPDATED,
  });
});

module.exports = router;
