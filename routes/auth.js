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
router.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.render("login", {
    title: "Sign in · Sampaguita HC",
    layout: false, // login is a standalone page, no rail/topbar
    error: null,
    username: "",
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
    });

  if (!username || !password) return fail("Enter your username and password.");

  try {
    const { rows } = await db.query(
      `SELECT user_id, full_name, username, role, status, password_hash
         FROM users WHERE username = $1`,
      [username]
    );
    const u = rows[0];

    // Same generic message whether the user is missing or the password is wrong
    // (don't leak which usernames exist).
    if (!u) return fail("Invalid username or password.");
    if (u.status !== "active")
      return fail("This account is inactive. Contact an admin.");

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return fail("Invalid username or password.");

    // Minimal session payload — never store the hash.
    req.session.user = {
      user_id: u.user_id,
      full_name: u.full_name,
      username: u.username,
      role: u.role,
    };

    audit.log(u.user_id, "login", "user", u.user_id, `${u.username} signed in`);

    const dest = req.session.returnTo || "/";
    delete req.session.returnTo;
    res.redirect(dest);
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
