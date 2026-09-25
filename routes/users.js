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

router.get("/admin/users", async (req, res, next) => {
  try {
    const [{ rows }, pending] = await Promise.all([
      db.query(
        `SELECT user_id, full_name, username, email, role, status, created_at
           FROM users ORDER BY created_at DESC`
      ),
      pw.listPending(),
    ]);

    // A temporary password from an approved 'forgot' request, shown exactly
    // once and then gone from the session. It is the only moment it exists in
    // plain text; refreshing the page does not bring it back.
    const issued = req.session.issuedTempPassword || null;
    delete req.session.issuedTempPassword;

    res.render("users/list", {
      title: "Staff accounts · Sampaguita HC",
      active: "settings",
      staff: rows,
      pending,
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
router.post("/admin/password-requests/:id/approve", async (req, res, next) => {
  try {
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

// ---- BACKUP  GET /admin/backup ---------------------------------------------------
// "Need backup database." The same snapshot `npm run backup` writes, as a
// download, so the admin can take a copy from the clinic's own computer
// without a terminal. Admin-only (this router's /admin guard) and written to
// the activity log every time, because a file holding every patient record
// leaving the system is exactly the kind of event that log exists for.
const { snapshot, filenameFor } = require("../lib/backup");
router.get("/admin/backup", async (req, res, next) => {
  try {
    const data = await snapshot();
    const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
    audit.log(req.session.user.user_id, "create", "backup", null,
      `downloaded a full backup (${Object.keys(data.counts).length} tables, ${total} rows)`);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filenameFor()}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(JSON.stringify(data));
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
