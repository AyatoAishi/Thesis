// ============================================================================
// lib/backupStore.js — the automatic weekly backups (panel review, Oct 2026).
//
// "Auto back up, at least every week." "Irewrite na yung old data pag
// magbbackup." The group's answer: the five most recent are kept, and the
// sixth replaces the oldest.
//
// WHERE. In a SECOND, separate free Neon database (BACKUP_DATABASE_URL), not
// in the main one. A backup kept inside the database it is backing up is lost
// with it — exactly the day it is needed. Each backup is one row there.
//
// WHAT. The same full snapshot as the admin's download (lib/backup.js),
// gzip-compressed, then encrypted with BACKUP_KEY (lib/backupCrypto.js —
// OpenSSL's format, so it opens even without this system). The key lives
// only in the server's secret settings; the backup database alone is
// unreadable.
//
// WHEN. The daily job (server.js, called every morning by cron-job.org) asks
// maybeWeekly(); it makes one when the newest is about a week old. The
// recovery page can also make one on demand.
//
// Neither setting present = backups switched off, said plainly on the
// recovery page, never a crash.
// ============================================================================
const zlib = require("zlib");
const { Pool } = require("pg");
const backupCrypto = require("./backupCrypto");
const { snapshot } = require("./backup");

const KEEP = 5;                       // weekly/manual backups kept
const KEEP_BEFORE_RESTORE = 1;        // the copy taken just before a restore
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SLACK_MS = 6 * 60 * 60 * 1000;  // the daily job runs at about the same hour each day

let pool = null;
let tableReady = false;

function missing() {
  const out = [];
  if (!process.env.BACKUP_DATABASE_URL) out.push("BACKUP_DATABASE_URL");
  if ((process.env.BACKUP_KEY || "").length < backupCrypto.MIN_PASSPHRASE) out.push("BACKUP_KEY");
  return out;
}
const configured = () => missing().length === 0;

function getPool() {
  if (!configured()) throw new Error(`Backups are not set up yet (missing ${missing().join(" and ")}).`);
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.BACKUP_DATABASE_URL,
      ssl: /localhost|127\.0\.0\.1/.test(process.env.BACKUP_DATABASE_URL) ? false : { rejectUnauthorized: false },
      max: 2,
      connectionTimeoutMillis: 15000,
    });
    pool.on("error", (e) => console.error("[backup db] idle pool error:", e.message));
  }
  return pool;
}

async function ready() {
  const p = getPool();
  if (!tableReady) {
    await p.query(`CREATE TABLE IF NOT EXISTS weekly_backups (
        backup_id  SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        kind       VARCHAR(12) NOT NULL CHECK (kind IN ('auto', 'manual', 'pre-restore')),
        size_bytes INTEGER NOT NULL,
        rows_total INTEGER NOT NULL,
        tables     INTEGER NOT NULL,
        note       VARCHAR(160),
        data       BYTEA NOT NULL
      )`);
    tableReady = true;
  }
  return p;
}

// The list, newest first, without the (large) data itself.
async function list() {
  const p = await ready();
  const { rows } = await p.query(
    `SELECT backup_id, created_at, kind, size_bytes, rows_total, tables, note
       FROM weekly_backups ORDER BY created_at DESC, backup_id DESC`
  );
  return rows;
}

// Keep the newest KEEP regular backups and the newest pre-restore copy.
async function prune(p) {
  await p.query(
    `DELETE FROM weekly_backups
      WHERE kind IN ('auto', 'manual')
        AND backup_id NOT IN (SELECT backup_id FROM weekly_backups WHERE kind IN ('auto', 'manual')
                               ORDER BY created_at DESC, backup_id DESC LIMIT $1)`,
    [KEEP]
  );
  await p.query(
    `DELETE FROM weekly_backups
      WHERE kind = 'pre-restore'
        AND backup_id NOT IN (SELECT backup_id FROM weekly_backups WHERE kind = 'pre-restore'
                               ORDER BY created_at DESC, backup_id DESC LIMIT $1)`,
    [KEEP_BEFORE_RESTORE]
  );
}

// Snapshot the main database, seal it, store it, drop the oldest.
async function create(kind = "manual", note = null) {
  const p = await ready();
  const data = await snapshot();
  const rowsTotal = Object.values(data.counts).reduce((a, b) => a + b, 0);
  const sealed = backupCrypto.encrypt(zlib.gzipSync(Buffer.from(JSON.stringify(data), "utf8")), process.env.BACKUP_KEY);
  const { rows } = await p.query(
    `INSERT INTO weekly_backups (kind, size_bytes, rows_total, tables, note, data)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING backup_id, created_at`,
    [kind, sealed.length, rowsTotal, Object.keys(data.counts).length, note ? String(note).slice(0, 160) : null, sealed]
  );
  await prune(p);
  return { id: rows[0].backup_id, created_at: rows[0].created_at, size: sealed.length, rows: rowsTotal };
}

// Called by the daily job. Makes the weekly backup when one is due.
async function maybeWeekly() {
  if (!configured()) return { skipped: "not set up" };
  const p = await ready();
  const { rows } = await p.query(
    "SELECT max(created_at) AS last FROM weekly_backups WHERE kind IN ('auto', 'manual')"
  );
  const last = rows[0].last ? new Date(rows[0].last).getTime() : 0;
  if (last && Date.now() - last < WEEK_MS - SLACK_MS) return { skipped: "not due", last: rows[0].last };
  return { made: await create("auto") };
}

async function getSealed(id) {
  const p = await ready();
  const { rows } = await p.query(
    "SELECT backup_id, created_at, kind, data FROM weekly_backups WHERE backup_id = $1", [id]
  );
  return rows[0] || null;
}

// Sealed bytes -> the snapshot object.
function open(sealed) {
  return JSON.parse(zlib.gunzipSync(backupCrypto.decrypt(sealed, process.env.BACKUP_KEY)).toString("utf8"));
}

const filenameFor = (row) =>
  `sampaguita-${row.kind === "auto" ? "weekly" : row.kind}-backup-` +
  new Date(row.created_at).toISOString().slice(0, 16).replace(/[:T]/g, "-") + ".json.gz.enc";

async function ping() {
  if (!configured()) return { ok: false, reason: `not set up (missing ${missing().join(" and ")})` };
  try {
    await (await ready()).query("SELECT 1");
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

module.exports = {
  KEEP, WEEK_MS, missing, configured, list, create, maybeWeekly, getSealed, open, filenameFor, ping,
};
