// ============================================================================
// routes/auth.js — login & logout (M1)
// Verifies username + password against users.password_hash (bcryptjs),
// stores a minimal user object in the session, never the password hash.
// ============================================================================
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const audit = require("../lib/audit");

const router = express.Router();

// ---- GET /login : show the form (skip the app shell) -----------------------
// This used to redirect straight to the dashboard whenever a session already
// existed. On a shared clinic desk that is a hole, not a convenience: if the
// last staff member never signed out, anyone who pressed "Clinic staff" on the
// landing page was inside the records without typing a single character.
// Now the page always renders and says whose session is open, so continuing is
// a decision someone makes rather than something that happens to them.
router.get("/login", (req, res) => {
  res.render("login", {
    title: "Sign in · Sampaguita HC",
    layout: false, // login is a standalone page, no rail/topbar
    error: null,
    username: "",
    signedInAs: req.session.user ? req.session.user.full_name : null,
  });
});

// ---- POST /login : verify credentials --------------------------------------
router.post("/login", async (req, res) => {
  const username = (req.body.username || "").trim();
  const password = req.body.password || "";

  const fail = (msg) =>
    res.status(401).render("login", {
      title: "Sign in · Sampaguita HC",
      layout: false,
      error: msg,
      username,
      signedInAs: null, // a failed attempt is no time to offer a shortcut in
    });

  if (!username || !password) return fail("Enter your username and password.");

  try {
    // Exact match, capitalisation included: "Admin" is not "admin". A staff
    // username is issued by an admin and typed as issued — the client's call,
    // and it keeps the login a strict comparison with nothing inferred.
    const { rows } = await db.query(
      `SELECT user_id, full_name, username, role, status, password_hash
         FROM users WHERE username = $1`,
      [username]
    );
    const u = rows[0];

    // Same generic message whether the user is missing or the password is
    // wrong (don't leak which usernames exist) — but the audit log records
    // WHICH of the two it was, so an intermittent "wrong password" that the
    // user swears was correct can actually be diagnosed instead of guessed at.
    if (!u) {
      audit.log(null, "login_failed", "user", null, `no such username: "${username}"`);
      return fail("Invalid username or password.");
    }
    if (u.status !== "active")
      return fail("This account is inactive. Contact an admin.");

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      audit.log(u.user_id, "login_failed", "user", u.user_id, `wrong password for ${u.username}`);
      return fail("Invalid username or password.");
    }

    // Start a brand-new session ID now that this browser is authenticated
    // (session fixation): whatever cookie was sitting here before must not be
    // the one carrying an admin. The portal half is carried across on purpose
    // so staff testing the patient side aren't signed out of it.
    const patientHalf = req.session.patient;
    const returnTo = req.session.returnTo;
    const dest = returnTo && returnTo !== "/" ? returnTo : "/dashboard";

    req.session.regenerate((regenErr) => {
      if (regenErr) {
        console.error("[login] regenerate", regenErr.message);
        return fail("Something went wrong. Try again.");
      }
      if (patientHalf) req.session.patient = patientHalf;

      // Minimal session payload — never store the hash.
      req.session.user = {
        user_id: u.user_id,
        full_name: u.full_name,
        username: u.username,
        role: u.role,
      };

      // Wait for the session to actually reach Postgres before redirecting.
      // Without this the browser can arrive at the dashboard a beat before the
      // session row exists and get bounced back to the login page.
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error("[login] save", saveErr.message);
          return fail("Something went wrong. Try again.");
        }
        audit.log(u.user_id, "login", "user", u.user_id, `${u.username} signed in`);
        res.redirect(dest);
      });
    });
  } catch (e) {
    console.error("[login]", e.message);
    fail("Something went wrong. Try again.");
  }
});

// ---- POST /logout ----------------------------------------------------------
router.post("/logout", (req, res) => {
  const u = req.session.user;
  if (u) audit.log(u.user_id, "logout", "user", u.user_id, `${u.username} signed out`);
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
});

module.exports = router;
