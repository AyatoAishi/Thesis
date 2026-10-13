// ============================================================================
// lib/patientPhoto.js — the patient's optional profile photo (panel review,
// Oct 2026). Added by the patient on the portal; shown to staff on the
// patient's page. See db/migrations/2026-10-13-patient-photos.js.
//
// The browser does the resizing: the portal page draws the chosen picture
// onto a 256×256 canvas and sends that as a JPEG, so a 4 MB phone photo
// arrives as roughly 30 KB and this server needs no image library. What
// arrives is still checked here — the right kind, a real image header, a
// sane size — because a form can be sent by something other than our page.
// ============================================================================
const db = require("../db");

const MAX_BYTES = 200 * 1024;
const SIGNATURES = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
};

// "data:image/jpeg;base64,...." -> { mime, buf }, or null if it is not a
// small JPEG/PNG whose first bytes say so.
function parse(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  if (!buf.length || buf.length > MAX_BYTES) return null;
  if (!SIGNATURES[m[1]].every((b, i) => buf[i] === b)) return null;
  return { mime: m[1], buf };
}

async function save(patientId, { mime, buf }) {
  await db.query(
    `INSERT INTO patient_photos (patient_id, mime, data, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (patient_id) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, updated_at = now()`,
    [patientId, mime, buf]
  );
}

async function remove(patientId) {
  const { rowCount } = await db.query("DELETE FROM patient_photos WHERE patient_id = $1", [patientId]);
  return rowCount > 0;
}

async function get(patientId) {
  const { rows } = await db.query(
    "SELECT mime, data, updated_at FROM patient_photos WHERE patient_id = $1", [patientId]
  );
  return rows[0] || null;
}

// The image itself. Never cached by a shared cache, never guessed at by the
// browser as anything but the image type it says it is.
function send(res, photo) {
  res.set({
    "Content-Type": photo.mime,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
  });
  res.send(photo.data);
}

module.exports = { parse, save, remove, get, send, MAX_BYTES };
