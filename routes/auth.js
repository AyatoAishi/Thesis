// ============================================================================
// routes/auth.js — login & logout (M1)
// Verifies username + password against users.password_hash (bcryptjs),
// stores a minimal user object in the session, never the password hash.
// ============================================================================
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const audit = require("../lib/audit");
const { endOtherStaffSessions, REASONS } = require("../lib/sessions");
const guard = require("../lib/loginGuard");

const router = express.Router();

// Why a session was cut short, in the wording the person sees on the way back
// in. Keys match what server.js puts on ?ended= (see lib/sessions.js REASONS).
const ENDED = {
  "signed-in-elsewhere":
    "Someone else signed in to this account, so you were signed out here. A staff account is meant for one person — ask an admin for your own.",
  "password-changed":
    "The password for this account was changed, so you were signed out. Sign in again with the new password.",
  inactive: "Your session ended because this account is no longer active. Ask an admin.",
};

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
    // A session that was cut short says why. Being thrown out mid-task with no
    // explanation reads like a bug, and staff would report it as one.
    error: ENDED[req.query.ended] || null,
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

  const ip = guard.addressOf(req);

  try {
    // Asked before the row is fetched and before bcrypt runs. A locked-out
    // attempt should cost this server nothing — making an attacker’s
    // thousandth guess as expensive as the first is most of the point.
    const gate = await guard.check({ kind: "staff", username, ip });
    if (gate.blocked) {
      await guard.record({ kind: "staff", username, ip, ok: false, reason: "locked_out" });
      audit.log(null, "login_blocked", "user", null,
        `rate limit hit for "${username}" (${gate.reason})`);
      return fail(guard.lockoutMessage(gate.retryAfterMinutes));
    }
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
      await guard.record({ kind: "staff", username, ip, ok: false, reason: "no_such_user" });
      audit.log(null, "login_failed", "user", null, `no such username: "${username}"`);
      return fail("Invalid username or password.");
    }
    if (u.status !== "active") {
      await guard.record({ kind: "staff", username, ip, ok: false, reason: "inactive" });
      return fail("This account is inactive. Contact an admin.");
    }

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      await guard.record({ kind: "staff", username, ip, ok: false, reason: "wrong_password" });
      audit.log(u.user_id, "login_failed", "user", u.user_id, `wrong password for ${u.username}`);
      // One short of the limit is the last warning anyone gets, and the
      // person it helps most is the nurse who genuinely forgot.
      const after = await guard.check({ kind: "staff", username, ip });
      if (after.blocked) return fail(guard.lockoutMessage(after.retryAfterMinutes));
      const left = guard.MAX_PER_USERNAME - (after.userFails || 0);
      return fail(
        left === 1
          ? "Invalid username or password. One more failed attempt will lock this account for a few minutes."
          : "Invalid username or password."
      );
    }

    // Recorded before the redirect, because this success is what clears the
    // failure count for this username.
    await guard.record({ kind: "staff", username, ip, ok: true, reason: null });

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
      req.session.save(async (saveErr) => {
        if (saveErr) {
          console.error("[login] save", saveErr.message);
          return fail("Something went wrong. Try again.");
        }

        // One account, one person. Any other browser signed in as this user is
        // ended — it finds out on its next click and is told why. The admin
        // account in particular belongs to a single person, and an account
        // quietly shared by three is an activity log that can't name anyone.
        //
        // Runs after the save so the new session is already stored and cannot
        // be caught by its own sweep.
        const ended = await endOtherStaffSessions(u.user_id, req.sessionID, REASONS.taken);

        audit.log(
          u.user_id, "login", "user", u.user_id,
          ended ? `${u.username} signed in (signed out ${ended} other session${ended === 1 ? "" : "s"})`
                : `${u.username} signed in`
        );
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
