// One-off migration (2026-09-04): remove 'doctor' as a staff role.
//
// The doctor-approval *workflow* went on 2026-08-20. The role itself stayed
// behind — still in the CHECK constraint, still an option in the role dropdown
// on /users, still held by one seeded account. A role nobody can ever fill is
// worse than no role: assign it and you get a staff member who can sign in,
// read every patient record, and belongs to a job that does not exist here.
//
// What this does:
//
//   users with role='doctor'  -> moved to 'nurse'. They are clinical staff who
//     record visits; nurse is the role that keeps exactly the access they had
//     without inventing a new one. Written to the audit log, because silently
//     changing someone's permissions is not something that should only exist
//     in a migration script's memory.
//
//   users.role CHECK          -> rebuilt without 'doctor', so it can never be
//     set again, by this app or by hand at the psql prompt.
//
//   visits.doctor_id          -> dropped. Nothing has ever written it; grep the
//     repo and the column appears in exactly one place, schema.sql. It is not
//     history, it is a field that was never filled in.
//
// Safe to re-run (the second run finds nothing to do).
// Usage: node db/migrations/2026-09-04-remove-doctor-role.js
require("dotenv").config();
const db = require("..");

const ROLES = ["nurse", "facilitator", "recorder", "admin"];

(async () => {
  // ---- 1) anyone still holding the role ------------------------------------
  const moved = await db.query(
    `UPDATE users SET role = 'nurse', updated_at = now()
      WHERE role = 'doctor'
      RETURNING user_id, full_name, username`
  );
  for (const u of moved.rows) {
    await db.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
       VALUES (NULL, 'update', 'user', $1, $2)`,
      [u.user_id, "role changed doctor -> nurse (the doctor role was removed)".slice(0, 255)]
    );
    console.log(`OK: ${u.full_name} (${u.username}) moved from doctor to nurse.`);
  }
  if (!moved.rowCount) console.log("OK: no staff account held the doctor role.");

  // ---- 2) the constraint, so it cannot come back ---------------------------
  // Postgres names an inline CHECK after the table and column. Dropped by that
  // name and re-added explicitly, so the next person reading the schema can see
  // what it is called.
  await db.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await db.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_allowed`);
  await db.query(
    `ALTER TABLE users ADD CONSTRAINT users_role_allowed
       CHECK (role IN (${ROLES.map((r) => `'${r}'`).join(",")}))`
  );
  console.log(`OK: users.role is now limited to ${ROLES.join(", ")}.`);

  // ---- 3) the column nothing ever wrote ------------------------------------
  const had = await db.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'visits' AND column_name = 'doctor_id'`
  );
  await db.query(`ALTER TABLE visits DROP COLUMN IF EXISTS doctor_id`);
  console.log(had.rowCount ? "OK: visits.doctor_id dropped." : "OK: visits.doctor_id was already gone.");

  const left = await db.query(`SELECT role, count(*)::int AS n FROM users GROUP BY role ORDER BY role`);
  console.log("Staff by role now: " + left.rows.map((r) => `${r.role} ${r.n}`).join(", "));

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
