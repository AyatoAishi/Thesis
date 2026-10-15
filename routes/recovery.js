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
const { restoreSnapshot, isBackup } = require("../lib/restore");
const backupCrypto = require("../lib/backupCrypto");
const zlib = require("zlib");
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

// Where each database lives — the server name only, never the password — so
// the page can show that backups sit somewhere other than the data they copy
// (asked for the panel's revision review, Oct 2026).
function placeOf(url) {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const region = (/\.(ap|us|eu|sa|ca|me|af)-([a-z]+)-(\d)\./.exec(host) || []).slice(1).join("-");
    const neon = /neon\.tech$/.test(host);
    const project = neon ? host.split(".")[0].replace(/-pooler$/, "") : host + (u.port ? ":" + u.port : "") + u.pathname;
    return { host, project, region, neon };
  } catch {
    return null;
  }
}
const REGION_NAMES = { "ap-southeast-1": "Singapore", "us-east-1": "N. Virginia", "us-east-2": "Ohio", "us-west-2": "Oregon", "eu-central-1": "Frankfurt" };

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
    places: { main: placeOf(process.env.DATABASE_URL), backup: placeOf(process.env.BACKUP_DATABASE_URL) },
    regionNames: REGION_NAMES,
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

// ---- RESTORE FROM A FILE  POST /recovery/restore-file ------------------------
// Gabo, Oct 2026: "there should be a way to load this backup in case we need
// to roll back." Takes either kind of downloaded file:
//   - Staff accounts → Download backup (.json.enc), locked with the passphrase
//     the admin typed when downloading;
//   - a weekly backup downloaded from this page (.json.gz.enc), locked with
//     BACKUP_KEY — no passphrase needed, the server already has it.
// The page sends the file as the raw request body (fetch, application/octet-
// stream) with the passphrase and the RESTORE confirmation in headers, so the
// normal 100 KB form limit does not apply and no upload library is needed.
// Same safety as restoring from the list: a "before restore" copy first, and
// the restore is one transaction — any failure changes nothing.
const MAX_FILE = "60mb";

// Decrypt (with each key in turn), un-gzip if needed, parse, check it is ours.
function openUploaded(buf, passphrase) {
  const head = buf.subarray(0, 1).toString("latin1");
  const tryParse = (plain) => {
    if (plain[0] === 0x1f && plain[1] === 0x8b) plain = zlib.gunzipSync(plain);
    const snap = JSON.parse(plain.toString("utf8"));
    if (!isBackup(snap)) throw new Error("not a backup");
    return snap;
  };
  // An unencrypted JSON backup (npm run backup on the clinic's computer).
  if (head === "{") {
    try { return tryParse(buf); } catch { throw new Error("This file is not a Sampaguita backup."); }
  }
  const keys = [passphrase, process.env.BACKUP_KEY].filter(Boolean);
  if (!keys.length) throw new Error("Type the passphrase that was chosen when this file was downloaded.");
  for (const k of keys) {
    try { return tryParse(backupCrypto.decrypt(buf, k)); } catch { /* next key */ }
  }
  throw new Error(passphrase
    ? "Wrong passphrase, or this is not a Sampaguita backup file."
    : "Type the passphrase that was chosen when this file was downloaded.");
}

router.post("/recovery/restore-file", gate,
  express.raw({ type: "application/octet-stream", limit: MAX_FILE }),
  async (req, res) => {
    const reply = (msg, kind = "ok") => res.json({ redirect: `/recovery?${kind}=${encodeURIComponent(msg)}` });
    let pass = "";
    try { pass = decodeURIComponent(req.get("x-backup-passphrase") || ""); } catch { /* left empty */ }
    const name = String(req.get("x-file-name") || "file").replace(/[^\w.\- ]/g, "").slice(0, 120);
    if (String(req.get("x-restore-confirm") || "").trim() !== "RESTORE")
      return reply("Not restored: type RESTORE in capital letters to confirm.", "err");
    if (!Buffer.isBuffer(req.body) || !req.body.length)
      return reply("Not restored: choose the backup file first.", "err");
    try {
      const snap = openUploaded(req.body, pass);
      const made = snap.created_at || snap.generated_at || null;

      // A copy of what is there now, so a wrong file can be undone. Without the
      // backup database there is nowhere to keep it, so the person must say
      // they downloaded one themselves (the checkbox on the page).
      let safety = null;
      if (store.configured()) {
        try {
          safety = await store.create("pre-restore", `taken just before restoring the file ${name}`);
        } catch (e) {
          return reply(`Not restored: could not save a copy of the current data first (${e.message}).`, "err");
        }
      } else if (req.get("x-own-copy") !== "yes") {
        return reply("Not restored: the backup database is not set up, so no automatic copy of the current data can be made. " +
          "Download a backup of the current data first (Staff accounts → Download backup), then tick the box and try again.", "err");
      }

      const r = await restoreSnapshot(snap);
      audit.log(actorId(req), "update", "database", null,
        `restored the uploaded file ${name}${made ? ` (made ${String(made).slice(0, 16).replace("T", " ")} UTC)` : ""} ` +
        `(${r.rows} rows) — ${who(req)}` + (safety ? `; the data from just before is backup #${safety.id}` : "; no automatic copy (backup database not set up)"));
      reply(`Restored the file ${name}: ${r.tables} tables, ${r.rows} rows.` +
        (safety ? ` What was there before is kept as backup #${safety.id} ("before restore").` : ""));
    } catch (e) {
      reply(`Not restored — nothing was changed: ${e.message}`, "err");
    }
  });

// A file over the limit is refused by express.raw before the handler runs.
router.use("/recovery/restore-file", (err, req, res, next) => {
  if (err && err.type === "entity.too.large")
    return res.json({ redirect: `/recovery?err=${encodeURIComponent(`Not restored: the file is bigger than ${MAX_FILE}.`)}` });
  next(err);
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
