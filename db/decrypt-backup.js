// ============================================================================
// db/decrypt-backup.js — open a password-protected backup downloaded from
// Staff accounts → Download backup (lib/backupCrypto.js).
//
//   npm run backup:decrypt -- path\to\sampaguita-backup-....json.enc
//
// Asks for the passphrase (not echoed into shell history) and writes the
// plain JSON next to the file. That JSON holds every patient record: keep it
// on the clinic's own storage and delete it when done.
// ============================================================================
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { decrypt } = require("../lib/backupCrypto");

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error("Usage: npm run backup:decrypt -- <file.json.enc>");
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("Passphrase: ", (pass) => {
  rl.close();
  try {
    const plain = decrypt(fs.readFileSync(file), pass);
    const out = file.replace(/\.enc$/i, "") || path.join(path.dirname(file), "backup.json");
    const target = out === file ? file + ".json" : out;
    fs.writeFileSync(target, plain);
    console.log(`Decrypted to ${target}`);
    console.log("This file holds every patient record. Keep it off the internet.");
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
});
