// ============================================================================
// routes/users.js — staff/role management (v1 update, professor requirement)
// Admin-only: create staff accounts, change roles, activate/deactivate (revoke
// access) — the missing Admin-vs-Staff hierarchy flagged at the panel meeting.
// ============================================================================
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const audit = require("../lib/audit");
const { requireRole } = require("../middleware/auth");
const pw = require("../lib/passwordRequests");
const { endOtherStaffSessions, REASONS } = require("../lib/sessions");

const router = express.Router();
const ROLES = ["nurse", "facilitator", "recorder", "admin"];
const USERNAME_RE = /^[a-z0-9._]{3,30}$/;

// Path-scoped ON PURPOSE. This router is mounted at "/" in server.js, so a
// bare router.use(requireRole("admin")) runs on EVERY request that reaches it
// — including ones meant for the routers mounted after it (immunization,
// prenatal), which 403'd for every non-admin. Keep the "/admin" prefix here.
router.use("/admin", requireRole("admin"));

// ---- Who may change whom (Oct 2026: the super admin) -----------------------
// One account, the original admin, is the super admin (users.is_super_admin;
// see db/migrations/2026-10-04-super-admin.js). The point is that an admin
// account added later, if it is misused, cannot take the clinic away from the
// person responsible for it:
//   - nobody but the super admin can change, remove or reset the super admin;
//   - only the super admin can create, change, remove or reset an admin.
// Every other admin keeps full control of nurse, facilitator and recorder
// accounts. Read fresh from the database on each request, never the session.
async function actorOf(req) {
  const { rows } = await db.query(
    "SELECT user_id, role, is_super_admin FROM users WHERE user_id = $1",
    [req.session.user.user_id]
  );
  return rows[0] || { user_id: req.session.user.user_id, role: "admin", is_super_admin: false };
}

// Returns why `actor` may NOT act on `target` (optionally giving it `newRole`),
// or null when they may.
function refusal(actor, target, newRole) {
  if (target.is_super_admin && target.user_id !== actor.user_id)
    return "Only the super admin can change the super admin account.";
  if (!actor.is_super_admin && target.user_id !== actor.user_id &&
      (target.role === "admin" || newRole === "admin"))
    return "Only the super admin can manage administrator accounts.";
  return null;
}

async function loadStaff(id) {
  const { rows } = await db.query(
    `SELECT user_id, full_name, username, role, status, is_super_admin, deleted_at
       FROM users WHERE user_id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return rows[0] || null;
}

const back = (res, msg) => res.redirect("/admin/users?flash=" + encodeURIComponent(msg));

router.get("/admin/users", async (req, res, next) => {
  try {
    const [{ rows }, pending] = await Promise.all([
      db.query(
        `SELECT user_id, full_name, username, email, role, status, is_super_admin, created_at
           FROM users WHERE deleted_at IS NULL
          ORDER BY is_super_admin DESC, created_at DESC`
      ),
      pw.listPending(),
    ]);
    const me = await actorOf(req);
    rows.forEach((s) => { s.locked = refusal(me, s); });
    const removed = (await db.query(
      "SELECT count(*)::int AS n FROM users WHERE deleted_at IS NOT NULL")).rows[0].n;

    // A temporary password from an approved 'forgot' request, shown exactly
    // once and then gone from the session. It is the only moment it exists in
    // plain text; refreshing the page does not bring it back.
    const issued = req.session.issuedTempPassword || null;
    delete req.session.issuedTempPassword;

    res.render("users/list", {
      title: "Staff accounts · Sampaguita HC",
      active: "settings",
      staff: rows,
      me,
      removed,
      pending: pending.map((r) => Object.assign(r, {
        locked: r.role === "admin" && !me.is_super_admin
          ? "Only the super admin can decide an administrator's password request." : null,
      })),
      issued,
      flash: req.query.flash || null,
    });
  } catch (e) {
    next(e);
  }
});

router.get("/admin/users/new", (req, res) => {
  res.render("users/form", {
    title: "Add staff · Sampaguita HC",
    active: "settings",
    roles: ROLES,
    errors: [],
    values: {},
  });
});

router.post("/admin/users", async (req, res, next) => {
  const full_name = (req.body.full_name || "").trim();
  const username = (req.body.username || "").trim().toLowerCase();
  const email = (req.body.email || "").trim().toLowerCase() || null;
  const role = req.body.role || "";
  const password = req.body.password || "";
  const errors = [];

  if (!full_name) errors.push("Full name is required.");
  if (!USERNAME_RE.test(username)) errors.push("Username must be 3-30 chars: lowercase letters, numbers, dot, underscore.");
  if (!ROLES.includes(role)) errors.push("Choose a valid role.");
  if (password.length < 8) errors.push("Password must be at least 8 characters.");
  if (role === "admin" && !(await actorOf(req)).is_super_admin)
    errors.push("Only the super admin can create another administrator.");

  if (errors.length) {
    return res.status(400).render("users/form", {
      title: "Add staff · Sampaguita HC",
      active: "settings",
      roles: ROLES,
      errors,
      values: { full_name, username, email, role },
    });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (full_name, username, email, password_hash, role, status)
       VALUES ($1,$2,$3,$4,$5,'active') RETURNING user_id`,
      [full_name, username, email, hash, role]
    );
    audit.log(req.session.user.user_id, "create", "user", rows[0].user_id, `created staff ${username} (${role})`);
    res.redirect("/admin/users");
  } catch (e) {
    if (e.code === "23505") {
      return res.status(400).render("users/form", {
        title: "Add staff · Sampaguita HC",
        active: "settings",
        roles: ROLES,
        errors: ["That username or email is already in use."],
        values: { full_name, username, email, role },
      });
    }
    next(e);
  }
});

// Change role or active/inactive status. Admin cannot lock themselves out.
router.post("/admin/users/:id/update", async (req, res, next) => {
  const targetId = parseInt(req.params.id, 10);
  const role = req.body.role;
  const status = req.body.status;

  if (targetId === req.session.user.user_id && (role !== "admin" || status !== "active")) {
    return res.status(400).render("error", {
      title: "Not allowed",
      active: "",
      code: 400,
      message: "You can't demote or deactivate your own account.",
    });
  }
  if (!ROLES.includes(role) || !["active", "inactive"].includes(status)) {
    return res.status(400).send("Invalid role or status.");
  }

  try {
    const target = await loadStaff(targetId);
    if (!target) return next();
    const why = refusal(await actorOf(req), target, role);
    if (why) return back(res, why);
    const { rows } = await db.query(
      `UPDATE users SET role=$1, status=$2, updated_at=now() WHERE user_id=$3 RETURNING username`,
      [role, status, targetId]
    );
    if (!rows[0]) return next();
    audit.log(
      req.session.user.user_id,
      "update",
      "user",
      targetId,
      `set ${rows[0].username} to role=${role}, status=${status}`
    );
    res.redirect("/admin/users");
  } catch (e) {
    next(e);
  }
});

// ---- PASSWORD REQUESTS  POST /admin/password-requests/:id/(approve|reject) --
// The request's owner, so an ordinary admin cannot approve a password for an
// administrator account (that would be a way into one).
async function requestOwner(requestId) {
  const { rows } = await db.query(
    `SELECT u.user_id, u.role, u.is_super_admin FROM password_requests r
       JOIN users u ON u.user_id = r.user_id WHERE r.request_id = $1`,
    [requestId]
  );
  return rows[0] || null;
}

router.post("/admin/password-requests/:id/approve", async (req, res, next) => {
  try {
    const owner = await requestOwner(parseInt(req.params.id, 10));
    const why = owner && refusal(await actorOf(req), owner);
    if (why) return back(res, why);
    const done = await pw.approve(parseInt(req.params.id, 10), req.session.user.user_id);
    if (!done) {
      return res.redirect("/admin/users?flash=" +
        encodeURIComponent("That request was already handled — nothing changed."));
    }
    // Every session on that account ends. Passing the ADMIN's own session id
    // as the one to keep is deliberate: lib/sessions.js matches "sid <> $1",
    // and a null there matches nothing at all, so no session would end.
    const ended = await endOtherStaffSessions(done.userId, req.sessionID, REASONS.password);
    audit.log(
      req.session.user.user_id, "password_change", "user", done.userId,
      done.kind === "forgot"
        ? `approved a forgot-password request for ${done.username} and issued a temporary password`
        : `approved ${done.username}'s password change` +
          (ended ? ` (${ended} session${ended === 1 ? "" : "s"} signed out)` : "")
    );
    if (done.temp) {
      req.session.issuedTempPassword = { username: done.username, fullName: done.fullName, temp: done.temp };
      return req.session.save(() => res.redirect("/admin/users"));
    }
    res.redirect("/admin/users?flash=" + encodeURIComponent(`${done.fullName}'s new password is now active.`));
  } catch (e) {
    next(e);
  }
});

router.post("/admin/password-requests/:id/reject", async (req, res, next) => {
  try {
    const owner = await requestOwner(parseInt(req.params.id, 10));
    const why = owner && refusal(await actorOf(req), owner);
    if (why) return back(res, why);
    const done = await pw.reject(parseInt(req.params.id, 10), req.session.user.user_id, req.body.note);
    if (done) {
      audit.log(req.session.user.user_id, "password_change", "user", done.user_id,
        `rejected a ${done.kind === "forgot" ? "forgot-password" : "password-change"} request`);
    }
    res.redirect("/admin/users?flash=" + encodeURIComponent(
      done ? "Request rejected. The password is unchanged." : "That request was already handled — nothing changed."));
  } catch (e) {
    next(e);
  }
});

// ---- SET A STAFF PASSWORD  POST /admin/users/:id/password --------------------
// "As admin it should have an ability to ... change password of staffs." The
// admin types the new password (twice) and hands it over in person. Every
// session on that account ends, and any request they had pending is closed,
// since this decision replaces it. Your own password: My account, as before.
router.post("/admin/users/:id/password", async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (targetId === req.session.user.user_id)
      return back(res, "Change your own password from My account.");
    const target = await loadStaff(targetId);
    if (!target) return next();
    const why = refusal(await actorOf(req), target);
    if (why) return back(res, why);

    const pass = String(req.body.new_password || "");
    if (pass.length < 8) return back(res, `Not changed: ${target.full_name}'s new password must be at least 8 characters.`);
    if (pass !== String(req.body.confirm_password || ""))
      return back(res, "Not changed: the two passwords did not match.");

    await db.query("UPDATE users SET password_hash=$1, updated_at=now() WHERE user_id=$2",
      [await bcrypt.hash(pass, 10), targetId]);
    await db.query(
      `UPDATE password_requests SET status='cancelled', decided_by=$2, decided_at=now(),
              decision_note='replaced: the admin set the password directly'
        WHERE user_id=$1 AND status='pending'`,
      [targetId, req.session.user.user_id]
    );
    const ended = await endOtherStaffSessions(targetId, req.sessionID, REASONS.password);
    audit.log(req.session.user.user_id, "password_change", "user", targetId,
      `set a new password for ${target.username}` + (ended ? ` (${ended} session${ended === 1 ? "" : "s"} signed out)` : ""));
    back(res, `${target.full_name}'s password was changed. Give it to them in person.`);
  } catch (e) {
    next(e);
  }
});

// ---- DELETE A STAFF ACCOUNT  POST /admin/users/:id/delete --------------------
// An account that never recorded anything is deleted outright. One that did
// (registered patients, gave doses, signed in) cannot be: the clinic's records
// must keep saying who did each thing. That account is REMOVED instead:
// signed out, unable to sign in, gone from this list, and its name stays on
// its past work. The database decides which case it is: the delete is tried,
// and a foreign-key refusal (23503) means the account has history.
router.post("/admin/users/:id/delete", async (req, res, next) => {
  const targetId = parseInt(req.params.id, 10);
  if (targetId === req.session.user.user_id) return back(res, "You can't delete your own account.");
  let client;
  try {
    const target = await loadStaff(targetId);
    if (!target) return next();
    const why = refusal(await actorOf(req), target);
    if (why) return back(res, why);

    client = await db.getClient();
    let hard = true;
    await client.query("BEGIN");
    try {
      await client.query("DELETE FROM password_requests WHERE user_id = $1", [targetId]);
      await client.query("DELETE FROM users WHERE user_id = $1", [targetId]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      if (e.code !== "23503") throw e;
      hard = false;
    }
    if (!hard) {
      await db.query(
        `UPDATE users SET status='inactive', deleted_at=now(), updated_at=now() WHERE user_id=$1`,
        [targetId]
      );
      await db.query(
        `UPDATE password_requests SET status='cancelled', decided_by=$2, decided_at=now(),
                decision_note='account removed'
          WHERE user_id=$1 AND status='pending'`,
        [targetId, req.session.user.user_id]
      );
      await endOtherStaffSessions(targetId, req.sessionID, REASONS.password);
    }
    audit.log(req.session.user.user_id, "delete", "user", targetId,
      hard ? `deleted staff account ${target.username} (no records)`
           : `removed staff account ${target.username} (kept for the records it made)`);
    back(res, hard
      ? `${target.full_name}'s account was deleted.`
      : `${target.full_name}'s account was removed. They can no longer sign in; their name stays on the records they made.`);
  } catch (e) {
    next(e);
  } finally {
    if (client) client.release();
  }
});

// ---- BACKUP  GET /admin/backup ---------------------------------------------------
// "Need backup database." The same snapshot `npm run backup` writes, as a
// download, so the admin can take a copy from the clinic's own computer
// without a terminal. Admin-only (this router's /admin guard) and written to
// the activity log every time, because a file holding every patient record
// leaving the system is exactly the kind of event that log exists for.
//
// Oct 2026: the download is ENCRYPTED with a passphrase the admin types in the
// form (lib/backupCrypto.js — OpenSSL-compatible, so it opens without this
// system too). A plain copy of every patient record no longer leaves through
// the browser. The old GET link only explains where the button went.
const { snapshot, filenameFor } = require("../lib/backup");
const backupCrypto = require("../lib/backupCrypto");
router.get("/admin/backup", (req, res) => back(res,
  "Backups are now password-protected: use Download backup on this page and choose a passphrase."));
router.post("/admin/backup", async (req, res, next) => {
  try {
    const pass = String(req.body.passphrase || "");
    if (pass.length < backupCrypto.MIN_PASSPHRASE)
      return back(res, `No backup made: the passphrase must be at least ${backupCrypto.MIN_PASSPHRASE} characters.`);
    if (pass !== String(req.body.passphrase_confirm || ""))
      return back(res, "No backup made: the two passphrases did not match.");
    const data = await snapshot();
    const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
    const file = backupCrypto.encrypt(Buffer.from(JSON.stringify(data), "utf8"), pass);
    audit.log(req.session.user.user_id, "create", "backup", null,
      `downloaded an encrypted full backup (${Object.keys(data.counts).length} tables, ${total} rows)`);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filenameFor()}.enc"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(file);
  } catch (e) {
    next(e);
  }
});

// ---- ACTIVITY LOG  GET /admin/audit-log ------------------------------------
// Read-only view over audit_log (lib/audit.js) — logins/logouts, patient
// create/update/delete, and staff account changes. Panel's accountability
// requirement needed somewhere staff/admin can actually see it, not just a
// table quietly filling up in the database.
const AUDIT_ACTIONS = ["login", "logout", "create", "update", "delete", "password_change", "reschedule"];

// How the log can be ordered. A fixed map rather than anything taken from the
// query string, because this goes straight into ORDER BY — a value from the
// URL there is an injection, no matter how harmless it looks.
//
// "Who" sorts by the person and then by time within them, which is the shape
// of the actual question: not "list every actor alphabetically" but "show me
// everything this one person did, in order". Alyanna asked for sorting "per
// when and who" for exactly that reason — to check one person quickly.
const AUDIT_SORTS = {
  newest: { label: "Newest first", sql: "al.created_at DESC, al.audit_id DESC" },
  oldest: { label: "Oldest first", sql: "al.created_at ASC, al.audit_id ASC" },
  who:    { label: "By who", sql: "lower(coalesce(u.full_name, '~')), al.created_at DESC" },
  what:   { label: "By action", sql: "al.action, al.created_at DESC" },
};

router.get("/admin/audit-log", async (req, res, next) => {
  try {
    const action = AUDIT_ACTIONS.includes(req.query.action) ? req.query.action : "";
    const sort = AUDIT_SORTS[req.query.sort] ? req.query.sort : "newest";
    const orderSql = AUDIT_SORTS[sort].sql;
    const params = [];
    let where = "";
    if (action) {
      params.push(action);
      where = `WHERE al.action = $${params.length}`;
    }
    // The "On" column used to print entity_type and the raw row id — "user #1",
    // "patient_account #4". That is the database's own vocabulary and it meant
    // nothing to the people reading the page; Alyanna's note was "di ko gets
    // mashado sorry huhu, user # based on database ba natin to?". Yes it was.
    //
    // So the name is looked up for the four types that have one. The id is
    // still shown beside it, because two patients can share a name and the id
    // is what makes a line in an accountability log unambiguous — but the name
    // comes first, since that is what a person is looking for.
    //
    // LEFT JOINs, so a row whose subject has since been deleted still shows
    // its type and id rather than vanishing. A deleted patient is precisely
    // the kind of thing somebody comes to this page to look up.
    const { rows } = await db.query(
      `SELECT al.audit_id, al.action, al.entity_type, al.entity_id, al.details, al.created_at,
              u.full_name AS actor_name, u.username AS actor_username,
              CASE al.entity_type
                WHEN 'user'            THEN su.full_name
                WHEN 'patient'         THEN sp.full_name
                WHEN 'patient_account' THEN spa.username
                WHEN 'medicine'        THEN sm.name
              END AS subject_name
         FROM audit_log al
         LEFT JOIN users u  ON u.user_id  = al.user_id
         LEFT JOIN users su ON al.entity_type = 'user'    AND su.user_id    = al.entity_id
         LEFT JOIN patients sp ON al.entity_type = 'patient' AND sp.patient_id = al.entity_id
         LEFT JOIN patient_accounts spa ON al.entity_type = 'patient_account' AND spa.account_id = al.entity_id
         LEFT JOIN medicines sm ON al.entity_type = 'medicine' AND sm.medicine_id = al.entity_id
         ${where}
        ORDER BY ${orderSql}
        LIMIT 300`,
      params
    );
    res.render("users/audit-log", {
      title: "Activity log · Sampaguita HC",
      active: "settings",
      rows,
      action,
      actions: AUDIT_ACTIONS,
      sort,
      sorts: AUDIT_SORTS,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
