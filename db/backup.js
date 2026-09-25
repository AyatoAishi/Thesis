// ============================================================================
// db/backup.js — write a full snapshot of the database to backups/.
//
//   npm run backup
//
// The file holds every patient record and every staff password hash. It is
// written into backups/, which is gitignored because this repository is
// public. Keep it on the clinic's own storage (a USB drive in a locked drawer
// is a perfectly good answer), never in email or a public cloud folder.
//
// See lib/backup.js for what is and is not included, and docs/OPERATIONS.md
// for how often to run it and how it is restored.
// ============================================================================
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { snapshot, filenameFor } = require("../lib/backup");

(async () => {
  const data = await snapshot();
  const dir = path.join(__dirname, "..", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, filenameFor());
  fs.writeFileSync(file, JSON.stringify(data));
  const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
  console.log(`Backed up ${Object.keys(data.counts).length} tables, ${total} rows.`);
  for (const [t, n] of Object.entries(data.counts)) console.log(`  ${t.padEnd(22)} ${n}`);
  console.log(`\nWritten to ${file}`);
  console.log("This file holds every patient record. Keep it off the internet.");
  process.exit(0);
})().catch((e) => {
  console.error("BACKUP FAILED:", e.message);
  process.exit(1);
});
