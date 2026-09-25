// ============================================================================
// routes/account.js — staff self-service: update profile, change password.
// Mounted after requireLogin in server.js.
//
// 2026-09-25, from the professors' review:
//   - The Appearance section is gone ("remove the change theme"). Every account
//     now gets the clinic green; see lib/theme.js.
//   - A staff password change is a REQUEST that the admin approves ("should
//     have an approval from the admin"). The admin, having nobody above them,
//     still changes their own directly. See lib/passwordRequests.js.
// ============================================================================
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const audit = require("../lib/audit");
const { endOtherStaffSessions } = require("../lib/sessions");
const pw = require("../lib/passwordRequests");
const { addressOf } = require("../lib/loginGuard");

const router = express.Router();

const isAdmin = (req) => req.session.user && req.session.user.role === "admin";

// Everything the page needs to draw itself, so the render paths below cannot
// drift apart on what they pass.
async function accountView(req, extra) {
  const pending = isAdmin(req) ? null : await pw.pendingFor(req.session.user.user_id);
  return Object.assign(
    {
      title: "My account · Sampaguita HC",
      active: "",
      errors: [],
      notice: null,
      pendingPassword: pending,
      needsApproval: !isAdmin(req),
    },
    extra
  );
}

router.get("/account", async (req, res, next) => {
  try {
    const ended = parseInt(req.query.ended, 10) || 0;
    let notice = null;
    if (req.query.requested) notice = "Request sent. Your password changes once the admin approves it — until then, keep using the current one.";
    else if (req.query.cancelled) notice = "Request cancelled. Your password is unchanged.";
    else if (req.query.saved) {
      notice = ended
        ? `Saved. ${ended} other sign-in on this account ${ended === 1 ? "was" : "were"} signed out.`
        : "Saved.";
    }
    res.render("account", await accountView(req, { notice }));
  } catch (e) {
    next(e);
  }
});

router.post("/account/profile", async (req, res, next) => {
  const full_name = (req.body.full_name || "").trim();
  try {
    if (!full_name) {
      return res.status(400).render("account", await accountView(req, {
        errors: ["Full name is required."],
      }));
    }
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

  try {
    const fail = async (msg) =>
      res.status(400).render("account", await accountView(req, { errors: [msg] }));

    if (next_.length < 8) return fail("New password must be at least 8 characters.");
    if (next_ !== confirm) return fail("New password and confirmation don't match.");

    // The current password is checked for BOTH paths. Approval by the admin
    // is a second lock, not a replacement for the first — without this, anyone
    // at an unattended signed-in desk could queue a password of their choosing
    // and simply wait for it to be waved through.
    const { rows } = await db.query("SELECT password_hash FROM users WHERE user_id=$1", [
      req.session.user.user_id,
    ]);
    const ok = rows[0] && (await bcrypt.compare(current, rows[0].password_hash));
    if (!ok) return fail("Current password is incorrect.");
    if (await bcrypt.compare(next_, rows[0].password_hash))
      return fail("The new password is the same as the current one.");

    if (!isAdmin(req)) {
      await pw.requestChange(req.session.user.user_id, next_, addressOf(req));
      audit.log(req.session.user.user_id, "password_change", "user", req.session.user.user_id,
        "requested a password change — waiting for admin approval");
      return res.redirect("/account?requested=1");
    }

    // The admin: nobody above to approve, so the change applies now.
    const hash = await bcrypt.hash(next_, 10);
    await db.query("UPDATE users SET password_hash=$1, updated_at=now() WHERE user_id=$2", [
      hash,
      req.session.user.user_id,
    ]);
    // Anyone else signed in on this account is signed out. People change a
    // password precisely when they think somebody else is using the account.
    const ended = await endOtherStaffSessions(req.session.user.user_id, req.sessionID);
    audit.log(
      req.session.user.user_id, "password_change", "user", req.session.user.user_id,
      ended ? `changed own password (${ended} other session${ended === 1 ? "" : "s"} signed out)`
            : "changed own password"
    );
    res.redirect(`/account?saved=1${ended ? `&ended=${ended}` : ""}`);
  } catch (e) {
    next(e);
  }
});

router.post("/account/password/cancel", async (req, res, next) => {
  try {
    if (await pw.cancelOwn(req.session.user.user_id)) {
      audit.log(req.session.user.user_id, "password_change", "user", req.session.user.user_id,
        "cancelled own password-change request");
    }
    res.redirect("/account?cancelled=1");
  } catch (e) {
    next(e);
  }
});

module.exports = router;
