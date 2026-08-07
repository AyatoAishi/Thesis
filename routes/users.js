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

const router = express.Router();
const ROLES = ["nurse", "facilitator", "recorder", "doctor", "admin"];
const USERNAME_RE = /^[a-z0-9._]{3,30}$/;

router.use(requireRole("admin"));

router.get("/admin/users", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT user_id, full_name, username, email, role, status, created_at
         FROM users ORDER BY created_at DESC`
    );
    res.render("users/list", {
      title: "Staff accounts · Sampaguita HC",
      active: "settings",
      staff: rows,
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

// ---- ACTIVITY LOG  GET /admin/audit-log ------------------------------------
// Read-only view over audit_log (lib/audit.js) — logins/logouts, patient
// create/update/delete, and staff account changes. Panel's accountability
// requirement needed somewhere staff/admin can actually see it, not just a
// table quietly filling up in the database.
const AUDIT_ACTIONS = ["login", "logout", "create", "update", "delete", "password_change", "reschedule"];

router.get("/admin/audit-log", async (req, res, next) => {
  try {
    const action = AUDIT_ACTIONS.includes(req.query.action) ? req.query.action : "";
    const params = [];
    let where = "";
    if (action) {
      params.push(action);
      where = `WHERE al.action = $${params.length}`;
    }
    const { rows } = await db.query(
      `SELECT al.audit_id, al.action, al.entity_type, al.entity_id, al.details, al.created_at,
              u.full_name AS actor_name, u.username AS actor_username
         FROM audit_log al
         LEFT JOIN users u ON u.user_id = al.user_id
         ${where}
        ORDER BY al.created_at DESC
        LIMIT 300`,
      params
    );
    res.render("users/audit-log", {
      title: "Activity log · Sampaguita HC",
      active: "settings",
      rows,
      action,
      actions: AUDIT_ACTIONS,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
