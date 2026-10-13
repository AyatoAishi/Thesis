// ============================================================================
// db/recovery-hash.js — make the RECOVERY_PASSWORD_HASH server setting.
//
//   npm run recovery:hash
//
// Asks for the recovery super admin's password twice and prints its bcrypt
// hash. Paste the hash (not the password) into RECOVERY_PASSWORD_HASH on
// Render, with RECOVERY_USERNAME beside it. See lib/recovery.js.
//
// The password is read from the keyboard, not the command line, so it never
// lands in the shell's history.
// ============================================================================
const readline = require("readline");
const bcrypt = require("bcryptjs");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

(async () => {
  const a = await ask("Recovery password (at least 12 characters): ");
  const b = await ask("Type it again: ");
  rl.close();
  if (a.length < 12) {
    console.error("Too short — use at least 12 characters. Nothing was made.");
    process.exit(1);
  }
  if (a !== b) {
    console.error("The two did not match. Nothing was made.");
    process.exit(1);
  }
  const hash = await bcrypt.hash(a, 12);
  console.log("\nRECOVERY_PASSWORD_HASH=" + hash);
  console.log("\nPaste that value into Render (Environment), next to RECOVERY_USERNAME.");
  console.log("Keep the password itself somewhere safe — it is not stored anywhere.");
  process.exit(0);
})();
