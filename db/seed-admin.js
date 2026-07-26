// ============================================================================
// db/seed-admin.js — create (or reset) the first admin account.
// Run:  npm run seed:admin
// Optional overrides:  ADMIN_USER=... ADMIN_PASS=... ADMIN_NAME="..." npm run seed:admin
// If the username already exists, its password + role are reset (handy if you
// forget the password during development).
// ============================================================================
require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("./index");

const USER = process.env.ADMIN_USER || "admin";
const PASS = process.env.ADMIN_PASS || "admin123";
const NAME = process.env.ADMIN_NAME || "System Administrator";
const EMAIL = process.env.ADMIN_EMAIL || null;

(async () => {
  try {
    const hash = await bcrypt.hash(PASS, 10);
    await db.query(
      `INSERT INTO users (full_name, username, email, password_hash, role, status)
       VALUES ($1, $2, $3, $4, 'admin', 'active')
       ON CONFLICT (username)
       DO UPDATE SET password_hash = EXCLUDED.password_hash,
                     full_name     = EXCLUDED.full_name,
                     role          = 'admin',
                     status        = 'active',
                     updated_at    = now()`,
      [NAME, USER, EMAIL, hash]
    );
    console.log("\n  ✓ Admin account ready");
    console.log(`     username: ${USER}`);
    console.log(`     password: ${PASS}`);
    console.log("     ↳ change this password after your first login.\n");
    process.exit(0);
  } catch (e) {
    console.error("  ✗ Could not seed admin:", e.message);
    process.exit(1);
  }
})();
