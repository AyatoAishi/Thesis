// ============================================================================
// db/migrations/2026-10-04-super-admin.js
//
// "The system admin should be the super admin (the current 'admin') so in case
// that he included a new admin, when someday it was like kinda trolled, the
// superadmin account wouldn't compromise control." — Oct 2026 review.
//
// users.is_super_admin: exactly one account, the original admin (the lowest
// user_id with role 'admin'). Other admins run the clinic as before, but only
// the super admin can create, change, remove or reset another admin, and
// nobody but the super admin can touch the super admin. A partial unique
// index makes "two super admins" impossible at the database level.
//
// users.deleted_at: "Delete" for a staff account. An account that has never
// recorded anything is really deleted. One that has (patients registered,
// doses given, sign-ins in the activity log) cannot be: those records must
// keep saying who did them. That account is removed instead — deactivated,
// stamped here, hidden from the staff list — and its name still shows on the
// work it did.
//
// Run: node db/migrations/2026-10-04-super-admin.js   (safe to run twice)
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  await db.query(`ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_one_super_admin
    ON users ((true)) WHERE is_super_admin`);
  const { rows } = await db.query(`
    UPDATE users SET is_super_admin = true
     WHERE user_id = (SELECT min(user_id) FROM users WHERE role = 'admin' AND deleted_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM users WHERE is_super_admin)
    RETURNING username`);
  const { rows: s } = await db.query("SELECT username FROM users WHERE is_super_admin");
  console.log("OK: users.is_super_admin and users.deleted_at added.");
  console.log(rows.length ? `   Super admin set: ${rows[0].username}` : `   Super admin already: ${s[0] ? s[0].username : "(none — no admin exists)"}`);
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
