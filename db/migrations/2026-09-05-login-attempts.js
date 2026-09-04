// One-off migration (2026-09-05): record every sign-in attempt.
//
// This one table closes two of the three gaps the panel is most likely to ask
// about, which is why it is a table and not a counter in memory:
//
//   Rate limiting — nothing stopped anyone trying passwords against this login
//     all night. Counting failures in memory would work until the free Render
//     instance goes to sleep, which it does after fifteen idle minutes, and
//     wakes up having forgotten every attempt. A row survives that.
//
//   Portal sign-in auditing — audit_log records which STAFF signed in and
//     never recorded a patient doing it. Patients read health records through
//     that door. Now both sides land here, and the staff side keeps its
//     audit_log entry as well.
//
// It records failures AND successes. A log of only failures cannot answer
// "was that attacker ever let in", which is the question that actually matters
// the morning after.
//
// No password, hashed or otherwise, is ever written here. The username is
// stored as typed, because "which username were they guessing" is the point.
//
// Safe to re-run.
// Usage: node db/migrations/2026-09-05-login-attempts.js
require("dotenv").config();
const db = require("..");

(async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      attempt_id  BIGSERIAL PRIMARY KEY,
      kind        VARCHAR(10) NOT NULL CHECK (kind IN ('staff','portal')),
      username    VARCHAR(80) NOT NULL,
      ip          VARCHAR(45),
      ok          BOOLEAN     NOT NULL,
      reason      VARCHAR(40),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  console.log("OK: login_attempts ready.");

  // The guard's two questions, each with its own index: "how many times has
  // this username failed lately" and "how many times has this address failed
  // lately". Both are asked on every single sign-in attempt.
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_login_attempts_user
      ON login_attempts (kind, lower(username), created_at DESC)`);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_login_attempts_ip
      ON login_attempts (ip, created_at DESC)`);
  console.log("OK: indexes ready.");

  const { rows } = await db.query("SELECT count(*)::int AS n FROM login_attempts");
  console.log(`Note: ${rows[0].n} attempt(s) on file. Nothing is backfilled — every sign-in before today went unrecorded, which is the gap this closes.`);

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
