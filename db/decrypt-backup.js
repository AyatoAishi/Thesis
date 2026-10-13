// ============================================================================
// db/decrypt-backup.js — open a password-protected backup downloaded from
// Staff accounts → Download backup (lib/backupCrypto.js).
//
//   npm run backup:decrypt -- path\to\sampaguita-backup-....json.enc
//   npm run backup:decrypt -- path\to\sampaguita-weekly-backup-....json.gz.enc
//     (a weekly backup from Backups & recovery; its passphrase is BACKUP_KEY)
//
// Asks for the passphrase (not echoed into shell history) and writes the
// plain JSON next to the file. That JSON holds every patient record: keep it
// on the clinic's own storage and delete it when done.
// ============================================================================
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const zlib = require("zlib");
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
    let plain = decrypt(fs.readFileSync(file), pass);
    // The weekly backups (Backups & recovery) are gzip-compressed before
    // they are encrypted; unpack them so the result is plain JSON either way.
    if (plain[0] === 0x1f && plain[1] === 0x8b) plain = zlib.gunzipSync(plain);
    const out = file.replace(/\.enc$/i, "").replace(/\.gz$/i, "") || path.join(path.dirname(file), "backup.json");
    const target = out === file ? file + ".json" : out;
    fs.writeFileSync(target, plain);
    console.log(`Decrypted to ${target}`);
    console.log("This file holds every patient record. Keep it off the internet.");
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
});
