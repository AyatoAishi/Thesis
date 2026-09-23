// ============================================================================
// test/sql-injection.test.js
//
// Exists because a classmate reviewing the system said it looked "prone to SQL
// injection", and neither reading the code back nor saying "we use parameters"
// is an answer anybody should accept — including us. This fires real injection
// payloads at every text input that reaches a WHERE clause and then asks the
// database whether anything moved.
//
// What it proves, and the distinction matters:
//   1. The payload is treated as TEXT. Searching for "' OR 1=1 --" returns the
//      rows whose name contains that literal string, which is none — not every
//      row in the table.
//   2. Nothing is destroyed. Table counts before and after are identical, and
//      the tables a DROP payload names are still there.
//
// Run: node test/sql-injection.test.js   (needs the dev server on :3000)
//
// The reason it passes is not cleverness anywhere in this codebase. Every
// value in every query goes to node-postgres as a numbered parameter ($1, $2)
// and is sent to the server separately from the SQL text, so the database
// never parses it as SQL — it cannot, because by the time the value arrives
// the statement has already been planned. The only strings interpolated into
// SQL here are fixed fragments this repo wrote itself, and the one that looks
// like user input (ORDER BY on the patient list) is a whitelist lookup:
// routes/patients.js reads the sort key from SORTS and never from the query
// string. That is the whole defence, and it is why this file is boring.
// ============================================================================
require("dotenv").config();
const crypto = require("crypto");
const signature = require("cookie-signature");
const db = require("../db");

const BASE = process.env.TEST_BASE || "http://localhost:3000";

// Classic payloads: tautology, comment-terminated tautology, stacked statement,
// UNION probe, quote-breaker, and a boolean blind attempt.
const PAYLOADS = [
  "' OR 1=1 --",
  "' OR '1'='1",
  "'; DROP TABLE patients; --",
  "' UNION SELECT NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL --",
  "\\'; DELETE FROM medicines WHERE 1=1; --",
  "' AND (SELECT count(*) FROM users) > 0 --",
  "1; UPDATE users SET role='admin' --",
];

// Every GET endpoint that puts a typed string into a WHERE clause.
const TARGETS = [
  { label: "patient search", path: (v) => `/patients?q=${encodeURIComponent(v)}` },
  { label: "patient sort", path: (v) => `/patients?sort=${encodeURIComponent(v)}` },
  { label: "inventory search", path: (v) => `/inventory?q=${encodeURIComponent(v)}` },
  { label: "no-show report", path: (v) => `/reports/no-shows?q=${encodeURIComponent(v)}` },
  { label: "appointment list", path: (v) => `/appointments?status=${encodeURIComponent(v)}` },
  { label: "audit log sort", path: (v) => `/admin/users/audit?sort=${encodeURIComponent(v)}` },
];

const TABLES = ["patients", "users", "medicines", "appointments", "immunization_records", "audit_log"];

let bad = 0;
let sid = null;
const check = (label, ok, extra = "") => {
  if (!ok) bad++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${extra ? "   " + extra : ""}`);
};

async function counts() {
  const out = {};
  for (const t of TABLES) {
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM ${t}`);
    out[t] = rows[0].n;
  }
  return out;
}

(async () => {
  const u = (
    await db.query(
      "SELECT user_id, full_name, username, role FROM users WHERE role='admin' AND status='active' LIMIT 1"
    )
  ).rows[0];
  if (!u) {
    console.error("No active admin to sign in as.");
    process.exit(1);
  }

  sid = crypto.randomBytes(24).toString("hex");
  await db.query("INSERT INTO session (sid, sess, expire) VALUES ($1,$2,to_timestamp($3))", [
    sid,
    JSON.stringify({
      cookie: { originalMaxAge: 28800000, expires: new Date(Date.now() + 28800000).toISOString(), httpOnly: true, path: "/" },
      user: Object.assign({}, u, { preferences: {} }),
      csrf: crypto.randomBytes(20).toString("hex"),
    }),
    Math.floor(Date.now() / 1000) + 28800,
  ]);
  const cookie =
    "connect.sid=s%3A" +
    encodeURIComponent(signature.sign(sid, process.env.SESSION_SECRET)).replace(/%3A/g, ":");

  try {
    const before = await counts();
    // Captured before the payloads fly, so the escalation check at the end has
    // something real to compare against.
    const adminsBefore = (await db.query("SELECT count(*)::int AS n FROM users WHERE role='admin'")).rows[0].n;
    console.log("  Bago:  " + TABLES.map((t) => `${t}=${before[t]}`).join("  ") + "\n");

    let requests = 0;
    let errors = 0;
    for (const target of TARGETS) {
      for (const payload of PAYLOADS) {
        const res = await fetch(BASE + target.path(payload), { headers: { cookie } });
        requests++;
        // A 500 would mean the payload reached the database as SQL and broke
        // it. Anything else — a page, a redirect, a 400 — means the input was
        // handled as data.
        if (res.status >= 500) {
          errors++;
          console.log(`  FAIL  ${target.label} returned ${res.status} for ${payload}`);
        }
      }
    }
    check(`${requests} injection attempts, none crashed the query layer`, errors === 0, `${errors} server error(s)`);

    // The tautology test. "' OR 1=1 --" appended to a LIKE means the clinic has
    // no patient whose name contains that text, so the honest answer is zero
    // rows. If injection worked, the filter would have been neutralised and the
    // page would list everybody instead.
    const all = (await db.query("SELECT count(*)::int AS n FROM patients")).rows[0].n;
    const page = await (await fetch(BASE + `/patients?q=${encodeURIComponent("' OR 1=1 --")}`, { headers: { cookie } })).text();
    const listed = (page.match(/href="\/patients\/\d+/g) || []).length;
    check(
      "tautology payload matches nothing instead of every patient",
      listed === 0,
      `${listed} listed, ${all} exist in total`
    );

    // And the same payload as a literal search really does behave like text:
    // ask the database directly with the same parameter the route would use.
    const literal = await db.query("SELECT count(*)::int AS n FROM patients WHERE full_name ILIKE $1", ["%' OR 1=1 --%"]);
    check("the database treats it as a string, not a clause", literal.rows[0].n === 0);

    const after = await counts();
    const moved = TABLES.filter((t) => before[t] !== after[t]);
    check(
      "no table gained or lost a row",
      moved.length === 0,
      moved.length ? moved.map((t) => `${t}: ${before[t]}→${after[t]}`).join(", ") : ""
    );

    // The DROP payload named these by hand; confirm they are still present
    // rather than trusting that the count query above would have thrown.
    for (const t of ["patients", "medicines"]) {
      const { rows } = await db.query(
        "SELECT to_regclass($1) IS NOT NULL AS alive",
        [t]
      );
      check(`table ${t} still exists`, rows[0].alive === true);
    }

    // Nobody was promoted. The last payload tried exactly this.
    //
    // The first version of this line compared the count to itself through a
    // comma expression, which is a check that can only ever pass. Left as a
    // note rather than quietly corrected: a test that cannot fail is worse
    // than no test, because it reports safety it never looked for.
    const adminsAfter = (await db.query("SELECT count(*)::int AS n FROM users WHERE role='admin'")).rows[0].n;
    check(
      "admin count unchanged by the role-escalation payload",
      adminsAfter === adminsBefore,
      `${adminsBefore} before, ${adminsAfter} after`
    );
  } finally {
    if (sid) await db.query("DELETE FROM session WHERE sid=$1", [sid]);
  }

  console.log(
    bad
      ? `\n${bad} check(s) failed.`
      : "\nEvery payload was handled as text. Parameterised queries, and one whitelist on ORDER BY."
  );
  process.exit(bad ? 1 : 0);
})().catch(async (e) => {
  console.error("FAIL:", e.message);
  try {
    if (sid) await db.query("DELETE FROM session WHERE sid=$1", [sid]);
  } catch (_) {}
  process.exit(1);
});
