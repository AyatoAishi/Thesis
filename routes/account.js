// ============================================================================
// routes/account.js — staff self-service: update profile, change password (v1 update)
// Mounted after requireLogin in server.js.
// ============================================================================
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const audit = require("../lib/audit");

const router = express.Router();

router.get("/account", (req, res) => {
  res.render("account", {
    title: "My account · Sampaguita HC",
    active: "",
    errors: [],
    notice: req.query.saved ? "Saved." : null,
  });
});

router.post("/account/profile", async (req, res, next) => {
  const full_name = (req.body.full_name || "").trim();
  if (!full_name) {
    return res.status(400).render("account", {
      title: "My account · Sampaguita HC",
      active: "",
      errors: ["Full name is required."],
      notice: null,
    });
  }
  try {
    await db.query("UPDATE users SET full_name=$1, updated_at=now() WHERE user_id=$2", [
      full_name,
      req.session.user.user_id,
    ]);
    req.session.user.full_name = full_name;
    audit.log(req.session.user.user_id, "update", "user", req.session.user.user_id, "updated own profile");
    res.redirect("/account?saved=1");
  } catch (e) {
    next(e);
  }
});

router.post("/account/password", async (req, res, next) => {
  const current = req.body.current_password || "";
  const next_ = req.body.new_password || "";
  const confirm = req.body.confirm_password || "";
  const fail = (msg) =>
    res.status(400).render("account", {
      title: "My account · Sampaguita HC",
      active: "",
      errors: [msg],
      notice: null,
    });

  if (next_.length < 8) return fail("New password must be at least 8 characters.");
  if (next_ !== confirm) return fail("New password and confirmation don't match.");

  try {
    const { rows } = await db.query("SELECT password_hash FROM users WHERE user_id=$1", [
      req.session.user.user_id,
    ]);
    const ok = rows[0] && (await bcrypt.compare(current, rows[0].password_hash));
    if (!ok) return fail("Current password is incorrect.");

    const hash = await bcrypt.hash(next_, 10);
    await db.query("UPDATE users SET password_hash=$1, updated_at=now() WHERE user_id=$2", [
      hash,
      req.session.user.user_id,
    ]);
    audit.log(req.session.user.user_id, "password_change", "user", req.session.user.user_id, "changed own password");
    res.redirect("/account?saved=1");
  } catch (e) {
    next(e);
  }
});

module.exports = router;
