// ============================================================================
// db/migrations/2026-09-25-password-requests.js
//
// "When changing password, should have an approval from the admin (adds a layer
// of security)" and "Forgot password for staff" — two items from the
// professors' review, answered with one table, because they are the same event
// seen from two sides: a staff account's password is about to change, and the
// admin decides whether it does.
//
//   kind = 'change'  a signed-in staff member proved their current password and
//                    proposed a new one. The new HASH waits here; it is applied
//                    only when the admin approves. The plain password is never
//                    stored anywhere.
//   kind = 'forgot'  somebody at the sign-in page asked for help with a
//                    username. Nothing is proposed. On approval the admin is
//                    shown a temporary password, once, to hand over in person.
//
// At most one PENDING request per account (partial unique index), so a second
// request replaces the thought rather than stacking a queue the admin has to
// untangle.
//
// Run: node db/migrations/2026-09-25-password-requests.js
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS password_requests (
      request_id        SERIAL PRIMARY KEY,
      user_id           INTEGER NOT NULL REFERENCES users(user_id),
      kind              VARCHAR(10) NOT NULL CHECK (kind IN ('change', 'forgot')),
      new_password_hash TEXT,
      status            VARCHAR(10) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
      requested_ip      VARCHAR(45),
      requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      decided_by        INTEGER REFERENCES users(user_id),
      decided_at        TIMESTAMPTZ,
      decision_note     VARCHAR(255),
      -- A 'change' must carry a proposed hash; a 'forgot' must not.
      CHECK ((kind = 'change') = (new_password_hash IS NOT NULL))
    )`);
  console.log("OK: password_requests ready.");

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_password_requests_one_pending
      ON password_requests (user_id) WHERE status = 'pending'`);
  console.log("OK: one pending request per account.");

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_password_requests_pending
      ON password_requests (requested_at) WHERE status = 'pending'`);

  const { rows } = await db.query("SELECT count(*)::int AS n FROM password_requests");
  console.log(`   ${rows[0].n} request(s) on file.`);
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
