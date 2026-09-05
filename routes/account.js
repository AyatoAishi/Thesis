// ============================================================================
// routes/account.js — staff self-service: update profile, change password (v1 update)
// Mounted after requireLogin in server.js.
// ============================================================================
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const audit = require("../lib/audit");
const { endOtherStaffSessions } = require("../lib/sessions");
const themeLib = require("../lib/theme");

const router = express.Router();

// Everything the page needs to draw itself, so the three render paths below
// cannot drift apart on what they pass.
function accountView(req, extra) {
  return Object.assign(
    {
      title: "My account · Sampaguita HC",
      active: "",
      errors: [],
      notice: null,
      prefs: themeLib.normalize(req.session.user.preferences),
      presets: themeLib.PRESETS,
      fonts: themeLib.FONTS,
      // Each preset previewed in the mode being looked at, so the swatches on
      // the page are the colours that will actually be used rather than the
      // raw hex somebody typed into this file.
      ramp: (hex, dark) => themeLib.accentRamp(hex, dark),
      // So each font option can be shown in its own face.
      extraHead: `<link rel="stylesheet" href="${themeLib.allFontsHref()}" />`,
    },
    extra
  );
}

router.get("/account", (req, res) => {
  const ended = parseInt(req.query.ended, 10) || 0;
  res.render("account", accountView(req, {
    notice: req.query.saved
      ? ended
        ? `Saved. ${ended} other sign-in on this account ${ended === 1 ? "was" : "were"} signed out.`
        : "Saved."
      : null,
  }));
});

// ---- POST /account/preferences --------------------------------------------
// Appearance only. Nothing here touches a record, a role, or a password, so it
// is the one setting a staff member can change about themselves with no
// consequence to anybody else — which is exactly why it is worth having: the
// alternative is a system that fights the person using it all day.
router.post("/account/preferences", async (req, res, next) => {
  // fromForm validates every field and falls back to a default rather than
  // trusting the body. The accent in particular is a free-text hex from a
  // colour input, and lib/theme.js computes the readable shades around it.
  const prefs = themeLib.fromForm(req.body);
  try {
    await db.query(
      "UPDATE users SET preferences=$1::jsonb, updated_at=now() WHERE user_id=$2",
      [JSON.stringify(prefs), req.session.user.user_id]
    );
    // Written to the session too, or the change would not show until the next
    // sign-in: the layout reads appearance from the session on every render.
    req.session.user.preferences = prefs;
    audit.log(req.session.user.user_id, "update", "user", req.session.user.user_id,
      `changed appearance (${prefs.mode}, ${prefs.font}, ${prefs.accent}${prefs.animations ? "" : ", no animations"})`);
    // Saved before redirecting, so the very next page already looks right.
    req.session.save(() => res.redirect("/account?saved=1#appearance"));
  } catch (e) {
    next(e);
  }
});

router.post("/account/profile", async (req, res, next) => {
  const full_name = (req.body.full_name || "").trim();
  if (!full_name) {
    return res.status(400).render("account", accountView(req, {
      errors: ["Full name is required."],
    }));
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
    res.status(400).render("account", accountView(req, { errors: [msg] }));

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
    // Anyone else signed in on this account is signed out — including on
    // another computer. Someone changing their password is usually doing it
    // BECAUSE another person has been using the account, and leaving that
    // browser inside with the old session would make the change meaningless.
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

module.exports = router;
