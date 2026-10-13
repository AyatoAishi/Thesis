// ============================================================================
// lib/restore.js — put a backup back into the main database.
//
// Panel review, Oct 2026: "what if the system goes down, flooded by corrupted
// data" — the recovery page (routes/recovery.js) can replace everything with
// one of the weekly backups (lib/backupStore.js).
//
// ONE TRANSACTION. Every table in the backup is emptied and refilled inside a
// single BEGIN/COMMIT, so a restore that fails halfway changes nothing at all.
// The data is never left half old, half new.
//
// ORDER. A row can only go in after the rows it points at, so the tables are
// filled parents-first, worked out from the database's own foreign keys at the
// moment of restoring (not from a list that can go stale). A column that
// points back into its own table — or closes a loop between two tables — is
// filled in a second pass, once every row it might point at exists.
//
// SCHEMA DRIFT. A backup can be older than the code. Columns added since then
// keep their defaults; columns that no longer exist are ignored. Tables added
// since then are emptied if they hang off a restored table (TRUNCATE ...
// CASCADE), because their rows would point at records that, as of the backup,
// did not exist yet. Sign-ins (`session`) and the sign-in counter are never
// touched.
// ============================================================================
const db = require("../db");
const { SKIPPED } = require("./backup");

const q = (name) => `"${String(name).replace(/"/g, '""')}"`;
const SAFE_NAME = /^[a-z_][a-z0-9_]*$/;

// Pure: given the tables to fill and the foreign keys between them, the order
// to fill them in, and the columns to leave empty until a second pass.
//   tables  ["users", "patients", ...]   (the preferred order; kept when free)
//   edges   [{ child, column, parent }]
function plan(tables, edges) {
  const set = new Set(tables);
  const inScope = edges.filter((e) => set.has(e.child) && set.has(e.parent));
  const deferred = [];
  const deps = new Map(tables.map((t) => [t, new Set()]));
  for (const e of inScope) {
    if (e.child === e.parent) deferred.push({ table: e.child, column: e.column });
    else deps.get(e.child).add(e.parent);
  }
  const order = [];
  const done = new Set();
  const left = tables.slice();
  while (left.length) {
    const i = left.findIndex((t) => [...deps.get(t)].every((p) => done.has(p)));
    if (i === -1) {
      // A loop between tables. Break it at the first one left: its links to
      // the others still waiting are filled in on the second pass instead.
      const t = left[0];
      for (const e of inScope) {
        if (e.child === t && e.parent !== t && !done.has(e.parent)) deferred.push({ table: t, column: e.column });
      }
      deps.set(t, new Set([...deps.get(t)].filter((p) => done.has(p))));
      continue;
    }
    const t = left.splice(i, 1)[0];
    order.push(t);
    done.add(t);
  }
  // One entry per column, even if two constraints share it.
  const seen = new Set();
  return {
    order,
    deferred: deferred.filter((d) => {
      const k = `${d.table}.${d.column}`;
      return seen.has(k) ? false : (seen.add(k), true);
    }),
  };
}

// A value from the backup's JSON, back in the shape the column needs.
function toColumn(v, col) {
  if (v === null || v === undefined) return null;
  if (col.data_type === "bytea") {
    if (v && v.type === "Buffer" && Array.isArray(v.data)) return Buffer.from(v.data);
    if (typeof v === "string" && v.startsWith("\\x")) return Buffer.from(v.slice(2), "hex");
    return v;
  }
  // node-postgres would turn a JS array into a Postgres ARRAY literal, which
  // is right for TEXT[] and wrong for a JSON column holding a list.
  if (col.data_type === "json" || col.data_type === "jsonb") return JSON.stringify(v);
  return v;
}

function isBackup(snap) {
  return !!(snap && typeof snap === "object" && snap.system === "Sampaguita Health Clinic EMR" &&
            snap.tables && typeof snap.tables === "object");
}

// Restores `snap` (the object lib/backup.js snapshot() produces). Returns a
// summary { tables, rows }. Throws — with nothing changed — on any failure.
async function restoreSnapshot(snap) {
  if (!isBackup(snap)) throw new Error("This file is not a Sampaguita backup.");
  const client = await db.getClient();
  try {
    await client.query("BEGIN");

    const colQ = await client.query(
      `SELECT table_name, column_name, data_type, udt_name, is_generated, identity_generation, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position`
    );
    const columns = new Map();
    for (const c of colQ.rows) {
      if (!columns.has(c.table_name)) columns.set(c.table_name, new Map());
      columns.get(c.table_name).set(c.column_name, c);
    }

    const tables = Object.keys(snap.tables).filter(
      (t) => SAFE_NAME.test(t) && columns.has(t) && !SKIPPED.includes(t)
    );
    if (!tables.length) throw new Error("The backup holds no tables this database has.");

    const fkQ = await client.query(
      `SELECT tc.relname AS child, a.attname AS column, pc.relname AS parent
         FROM pg_constraint c
         JOIN pg_class tc ON tc.oid = c.conrelid
         JOIN pg_class pc ON pc.oid = c.confrelid
         JOIN pg_namespace n ON n.oid = tc.relnamespace
         JOIN LATERAL unnest(c.conkey) AS k(attnum) ON true
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        WHERE c.contype = 'f' AND n.nspname = 'public'`
    );
    const { order, deferred } = plan(tables, fkQ.rows);

    const pkQ = await client.query(
      `SELECT tc.relname AS table_name, a.attname AS column_name
         FROM pg_index i
         JOIN pg_class tc ON tc.oid = i.indrelid
         JOIN pg_namespace n ON n.oid = tc.relnamespace
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indisprimary AND n.nspname = 'public'`
    );
    const pkOf = new Map();
    for (const r of pkQ.rows) {
      if (!pkOf.has(r.table_name)) pkOf.set(r.table_name, []);
      pkOf.get(r.table_name).push(r.column_name);
    }

    // Empty everything being restored (and whatever hangs off it).
    await client.query(`TRUNCATE ${tables.map(q).join(", ")} RESTART IDENTITY CASCADE`);

    let rowsIn = 0;
    for (const t of order) {
      const rows = Array.isArray(snap.tables[t]) ? snap.tables[t] : [];
      if (!rows.length) continue;
      const meta = columns.get(t);
      const later = new Set(deferred.filter((d) => d.table === t).map((d) => d.column));
      const names = [...meta.values()]
        .filter((c) => c.is_generated !== "ALWAYS")
        .map((c) => c.column_name)
        .filter((n) => rows.some((r) => Object.prototype.hasOwnProperty.call(r, n)));
      if (!names.length) continue;
      const overriding = [...meta.values()].some((c) => c.identity_generation === "ALWAYS")
        ? " OVERRIDING SYSTEM VALUE" : "";
      const perStatement = Math.max(1, Math.floor(20000 / names.length));
      for (let i = 0; i < rows.length; i += perStatement) {
        const params = [];
        const tuples = rows.slice(i, i + perStatement).map((r) =>
          "(" + names.map((n) => {
            params.push(later.has(n) ? null : toColumn(r[n], meta.get(n)));
            return `$${params.length}`;
          }).join(",") + ")"
        );
        await client.query(
          `INSERT INTO ${q(t)} (${names.map(q).join(",")})${overriding} VALUES ${tuples.join(",")}`,
          params
        );
      }
      rowsIn += rows.length;
    }

    // Second pass: the links that had to wait for their target rows.
    for (const d of deferred) {
      const pk = pkOf.get(d.table);
      const meta = columns.get(d.table);
      if (!pk || pk.length !== 1 || !meta.has(d.column)) continue;
      const rows = (snap.tables[d.table] || []).filter((r) => r[d.column] !== null && r[d.column] !== undefined);
      if (!rows.length) continue;
      const pkCol = meta.get(pk[0]);
      const fkCol = meta.get(d.column);
      await client.query(
        `UPDATE ${q(d.table)} AS t SET ${q(d.column)} = v.val
           FROM unnest($1::${pkCol.udt_name}[], $2::${fkCol.udt_name}[]) AS v(id, val)
          WHERE t.${q(pk[0])} = v.id`,
        [rows.map((r) => r[pk[0]]), rows.map((r) => r[d.column])]
      );
    }

    // Counters (SERIAL ids) carry on after the highest id restored, so the
    // next new record does not collide with an old one.
    for (const t of tables) {
      for (const c of columns.get(t).values()) {
        if (!/^nextval\(/.test(c.column_default || "")) continue;
        await client.query(
          `SELECT setval(pg_get_serial_sequence($1, $2),
                         coalesce((SELECT max(${q(c.column_name)}) FROM ${q(t)}), 0) + 1, false)`,
          [t, c.column_name]
        );
      }
    }

    await client.query("COMMIT");
    return { tables: order.length, rows: rowsIn };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { plan, toColumn, isBackup, restoreSnapshot };
