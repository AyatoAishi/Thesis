// ============================================================================
// db/index.js — PostgreSQL connection pool + a tiny query() helper.
// Used by every route/service. Safe to import even when DATABASE_URL is blank
// (the app still boots; queries just report a friendly error until you set it).
// ============================================================================
const { Pool, types } = require("pg");

// Return DATE columns (oid 1082) as plain 'YYYY-MM-DD' strings instead of JS
// Date objects. node-postgres otherwise builds a Date at LOCAL midnight, which
// drifts to the previous/next day once the server runs in UTC (Render) while
// the clinic is in Asia/Manila. Strings keep appointment/birth dates exact.
types.setTypeParser(1082, (v) => v);

let pool = null;

// Lazily create the pool so a missing DATABASE_URL doesn't crash the app.
function getPool() {
  if (pool) return pool;
  const cs = process.env.DATABASE_URL;
  if (!cs) return null;

  const isLocal = /localhost|127\.0\.0\.1/.test(cs);
  pool = new Pool({
    connectionString: cs,
    // Neon/Supabase require SSL; a local Postgres does not.
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 5,
  });
  pool.on("error", (e) => console.error("[db] idle pool error:", e.message));
  return pool;
}

// Parameterized query helper — ALWAYS pass user input via `params`, never by
// string-concatenation (prevents SQL injection).
async function query(text, params) {
  const p = getPool();
  if (!p) {
    throw new Error(
      "DATABASE_URL is not set — add your Neon connection string to .env"
    );
  }
  return p.query(text, params);
}

// Lightweight connectivity check for the dashboard / health route.
async function ping() {
  if (!process.env.DATABASE_URL) {
    return { ok: false, reason: "DATABASE_URL not set" };
  }
  try {
    await query("SELECT 1");
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// Checked-out client for BEGIN/COMMIT/ROLLBACK transactions (e.g. inventory
// dispense: subtracting stock and inserting the dispense row must be atomic).
// Caller MUST client.release() when done, in a finally block.
async function getClient() {
  const p = getPool();
  if (!p) {
    throw new Error(
      "DATABASE_URL is not set — add your Neon connection string to .env"
    );
  }
  return p.connect();
}

module.exports = { getPool, query, ping, getClient };
