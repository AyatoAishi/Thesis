// ============================================================================
// lib/backupCrypto.js — password-protected backup files.
//
// "Encrypt download backup" (Oct 2026 review). The backup holds every patient
// record, so a copy left on a USB stick or a shared laptop is a data breach
// waiting to happen (RA 10173). The admin now types a passphrase when
// downloading; the file is useless without it.
//
// The format is OpenSSL's own `enc` format on purpose, so the file can be
// opened even if this system is gone, with a tool every IT person has:
//
//   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 \
//           -in sampaguita-backup-....json.enc -out backup.json
//
// Layout: "Salted__" + 8-byte random salt + AES-256-CBC ciphertext, where the
// key and IV are the first 32 and next 16 bytes of
// PBKDF2-HMAC-SHA256(passphrase, salt, 200000 iterations, 48 bytes).
// `npm run backup:decrypt -- <file>` does the same thing without OpenSSL.
//
// The passphrase is never stored anywhere. Forget it and the file is lost:
// that is the point, and the download form says so.
// ============================================================================
const crypto = require("crypto");

const ITERATIONS = 200000;
const MAGIC = Buffer.from("Salted__", "latin1");
const MIN_PASSPHRASE = 10;

function keyIv(passphrase, salt) {
  const kiv = crypto.pbkdf2Sync(String(passphrase), salt, ITERATIONS, 48, "sha256");
  return { key: kiv.subarray(0, 32), iv: kiv.subarray(32, 48) };
}

function encrypt(plain, passphrase) {
  const salt = crypto.randomBytes(8);
  const { key, iv } = keyIv(passphrase, salt);
  const c = crypto.createCipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([MAGIC, salt, c.update(plain), c.final()]);
}

// Throws "Wrong passphrase, or not a Sampaguita backup file." on failure.
function decrypt(file, passphrase) {
  const buf = Buffer.isBuffer(file) ? file : Buffer.from(file);
  if (buf.length < 32 || !buf.subarray(0, 8).equals(MAGIC))
    throw new Error("Not an encrypted Sampaguita backup file.");
  const { key, iv } = keyIv(passphrase, buf.subarray(8, 16));
  try {
    const d = crypto.createDecipheriv("aes-256-cbc", key, iv);
    return Buffer.concat([d.update(buf.subarray(16)), d.final()]);
  } catch {
    throw new Error("Wrong passphrase, or not a Sampaguita backup file.");
  }
}

module.exports = { encrypt, decrypt, ITERATIONS, MIN_PASSPHRASE };
