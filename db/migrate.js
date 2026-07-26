
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { getPool } = require("./index");

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("✗ DATABASE_URL is not set. Paste your Neon string into .env first.");
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  const pool = getPool();

  try {
    console.log("Running db/schema.sql ...");
    await pool.query(sql); // schema has no params, so multi-statement is fine
    console.log("✓ Schema applied: tables created and the 3 services seeded.");
  } catch (e) {
    console.error("✗ Failed to apply schema:", e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();

//cd "C:\Users\Geibrielle\Documents\ClaudeSpace\Thesis\clinic-system"
//npm run dev
//
// http://localhost:3000