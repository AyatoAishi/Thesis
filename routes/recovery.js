// ============================================================================
// routes/recovery.js — Backups & recovery (panel review, Oct 2026).
//
// Two people can open it:
//   - the recovery super admin (lib/recovery.js), whose credentials are server
//     settings, not database rows — so this page works while the main
//     database is down or corrupted, which is the reason it exists;
//   - the database super admin (users.is_super_admin), from their menu, on
//     an ordinary day.
//
// What it does:
//   - shows whether the main database and the backup database answer
//   - lists the five weekly backups (lib/backupStore.js), each downloadable
//   - makes a backup now
//   - RESTORES one into the main database (lib/restore.js), after taking one
//     last copy of what is there now, so a wrong choice can be undone
//   - resets an admin's password when the admin forgot it
//
// Mounted in server.js straight after requireLogin and BEFORE the per-request
// database check, which would sign the recovery account out (it is not a
// database row) and fails anyway when the database is down.
// ============================================================================
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const audit = require("../lib/audit");
const store = require("../lib/backupStore");
const { restoreSnapshot } = require("../lib/restore");
const { temporaryPassword } = require("../lib/passwordRequests");
const { endOtherStaffSessions, REASONS } = require("../lib/sessions");

const router = express.Router();

// Who may be here. The recovery account always; a database account only if it
// is, right now, the active super admin.
async function allowed(req) {
  const u = req.session.user;
  if (!u) return false;
  if (u.recovery) return true;
  try {
    const { rows } = await db.query(
      "SELECT is_super_admin, status FROM users WHERE user_id = $1 AND deleted_at IS NULL", [u.user_id]
    );
    return !!(rows[0] && rows[0].is_super_admin && rows[0].status === "active");
  } catch {
    return false;
  }
}

async function gate(req, res, next) {
  if (await allowed(req)) return next();
  res.status(403).render("error-standalone", {
    layout: false,
    title: "Not allowed",
    message: "Backups & recovery is for the super admin only.",
  });
}

const who = (req) => (req.session.user.recovery
  ? "the recovery super admin"
  : `${req.session.user.full_name} (super admin)`);
const actorId = (req) => req.session.user.user_id || null;
const back = (res, msg, kind = "ok") =>
  res.redirect(`/recovery?${kind}=${encodeURIComponent(msg)}`);

router.get("/recovery", gate, async (req, res) => {
  const [mainDb, backupDb] = await Promise.all([db.ping(), store.ping()]);
  let backups = [];
  let listError = null;
  if (backupDb.ok) {
    try { backups = await store.list(); } catch (e) { listError = e.message; }
  }
  let admins = [];
  if (mainDb.ok) {
    try {
      admins = (await db.query(
        `SELECT user_id, full_name, username, is_super_admin FROM users
          WHERE role = 'admin' AND deleted_at IS NULL ORDER BY is_super_admin DESC, full_name`
      )).rows.filter((a) => a.user_id !== req.session.user.user_id);
    } catch { /* shown as unreachable below */ }
  }
  // A one-time temporary password, shown once and gone on the next load.
  const issued = req.session.recoveryIssued || null;
  delete req.session.recoveryIssued;

  res.render("recovery", {
    title: "Backups & recovery · Sampaguita HC",
    layout: false,
    me: req.session.user,
    mainDb,
    backupDb,
    missing: store.missing(),
    backups,
    listError,
    admins,
    issued,
    keep: store.KEEP,
    ok: req.query.ok || null,
    err: req.query.err || null,
  });
});

router.post("/recovery/backup-now", gate, async (req, res) => {
  try {
    const made = await store.create("manual", `made by ${who(req)}`);
    audit.log(actorId(req), "create", "backup", made.id, `weekly-backup store: backup made now by ${who(req)} (${made.rows} rows)`);
    back(res, `Backup made — ${made.rows} rows. The oldest beyond ${store.KEEP} was removed.`);
  } catch (e) {
    back(res, `No backup made: ${e.message}`, "err");
  }
});

router.get("/recovery/backups/:id/download", gate, async (req, res, next) => {
  try {
    const row = await store.getSealed(parseInt(req.params.id, 10) || 0);
    if (!row) return back(res, "That backup no longer exists.", "err");
    audit.log(actorId(req), "create", "backup", row.backup_id, `downloaded weekly backup #${row.backup_id} (${who(req)})`);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${store.filenameFor(row)}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(row.data);
  } catch (e) {
    next(e);
  }
});

router.post("/recovery/backups/:id/restore", gate, async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  if (String(req.body.confirm || "").trim() !== "RESTORE")
    return back(res, "Not restored: type RESTORE in capital letters to confirm.", "err");
  try {
    const row = await store.getSealed(id);
    if (!row) return back(res, "That backup no longer exists.", "err");
    const snap = store.open(row.data);

    // One last copy of what is there now. If this was the wrong backup to
    // restore, this is how the clinic gets back to where it was a minute ago.
    // If the database cannot even be read, there is nothing to keep — and the
    // restore below will fail on its own, changing nothing.
    let safety = null;
    try {
      safety = await store.create("pre-restore", `taken just before restoring backup #${id}`);
    } catch (e) {
      return back(res, `Not restored: could not save a copy of the current data first (${e.message}).`, "err");
    }

    const r = await restoreSnapshot(snap);
    audit.log(actorId(req), "update", "database", null,
      `restored backup #${id} from ${new Date(row.created_at).toISOString().slice(0, 16).replace("T", " ")} UTC ` +
      `(${r.rows} rows) — ${who(req)}; the data from just before is backup #${safety.id}`);
    back(res, `Restored backup #${id}: ${r.tables} tables, ${r.rows} rows. ` +
      `What was there before is kept as backup #${safety.id} ("before restore").`);
  } catch (e) {
    back(res, `Not restored — nothing was changed: ${e.message}`, "err");
  }
});

router.post("/recovery/admin-password", gate, async (req, res) => {
  try {
    const targetId = parseInt(req.body.user_id, 10) || 0;
    if (targetId === req.session.user.user_id)
      return back(res, "Change your own password from My account.", "err");
    const { rows } = await db.query(
      "SELECT user_id, username, full_name FROM users WHERE user_id = $1 AND role = 'admin' AND deleted_at IS NULL",
      [targetId]
    );
    if (!rows[0]) return back(res, "Choose an admin account.", "err");
    const temp = temporaryPassword();
    await db.query(
      `UPDATE users SET password_hash = $1, password_changed_at = NULL, status = 'active', updated_at = now()
        WHERE user_id = $2`,
      [await bcrypt.hash(temp, 10), targetId]
    );
    await db.query(
      `UPDATE password_requests SET status = 'cancelled', decided_at = now(),
              decision_note = 'replaced: reset from Backups & recovery'
        WHERE user_id = $1 AND status = 'pending'`,
      [targetId]
    );
    await endOtherStaffSessions(targetId, req.sessionID, REASONS.password);
    audit.log(actorId(req), "password_change", "user", targetId,
      `set a new password for ${rows[0].username} from Backups & recovery (${who(req)})`);
    req.session.recoveryIssued = { username: rows[0].username, full_name: rows[0].full_name, temp };
    req.session.save(() => res.redirect("/recovery#admin"));
  } catch (e) {
    back(res, `Password not changed: ${e.message}`, "err");
  }
});

module.exports = router;
