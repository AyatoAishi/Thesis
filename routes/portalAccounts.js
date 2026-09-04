// ============================================================================
// routes/portalAccounts.js — STAFF management of patient portal accounts (M5).
// Mounted behind requireLogin. Staff can: see the account list (pending
// verifications first), verify an account after checking the physical valid
// ID, create an account for a patient at the desk, and reset credentials.
//
// The one-time temp password is passed via a session flash and shown exactly
// once on the patient page — only its bcrypt hash is stored. There is no
// patient-held recovery code: forgetting a password is handled by the patient
// walking in and staff pressing Reset here, which is the only recovery path
// that works for every patient (about half have no email on file).
// ============================================================================
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db");
const { ID_TYPES, UNVERIFIED: NO_ID } = require("../lib/idTypes");
const { endOtherPatientSessions } = require("../lib/sessions");

const router = express.Router();

const USERNAME_RE = /^[a-z0-9._]{4,30}$/;

// An 8-character temporary password, e.g. "kR7mQ2xB".
//
// Mixed case on purpose: with upper case only, an 8-character code drawn from
// 31 symbols is worth about 40 bits; mixing in lower case takes the alphabet to
// 54 and the code to ~46 bits, which is thousands of times more work to guess.
// The dash is gone — it added nothing to that and invited trailing spaces when
// staff copied the code.
//
// I, l, 1, O, 0 stay out of the alphabet. Staff read these out loud across a
// desk, and a password nobody can dictate is a password that gets reset again
// five minutes later.
function genCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}

// Local-only redirect target (same guard pattern as appointment status posts).
function safeBack(raw, fallback) {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
}

// "Juan Dela Cruz" -> "juan.dela.cruz". Staff shouldn't have to invent a
// username on the spot for every walk-in; they can still overwrite it.
function suggestUsername(fullName) {
  const base = (fullName || "")
    .toLowerCase()
    .normalize("NFD")          // "é" -> "e" + a combining mark…
    .replace(/[^a-z0-9\s]/g, "") // …which this then drops along with punctuation
    .trim()
    .replace(/\s+/g, ".")
    .slice(0, 30);
  return base.length >= 4 ? base : (base ? `${base}.patient`.slice(0, 30) : "");
}

// First free variant of the suggestion — juan.dela.cruz, then ...2, ...3.
async function uniqueUsername(base) {
  if (!base) return "";
  for (let i = 0; i < 25; i++) {
    const suffix = i === 0 ? "" : String(i + 1);
    const candidate = base.slice(0, 30 - suffix.length) + suffix;
    const { rowCount } = await db.query(
      "SELECT 1 FROM patient_accounts WHERE lower(username) = $1", [candidate]
    );
    if (!rowCount) return candidate;
  }
  return "";
}

// ---- LIST  /portal-accounts (pending first) ---------------------------------
router.get("/portal-accounts", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT a.account_id, a.username, a.valid_id_type, a.valid_id_number,
              a.is_verified, a.created_at,
              p.patient_id, p.patient_number, p.full_name
         FROM patient_accounts a
         JOIN patients p ON p.patient_id = a.patient_id
        ORDER BY a.is_verified ASC, a.created_at DESC
        LIMIT 300`
    );
    res.render("portal-accounts/list", {
      title: "Portal accounts · Sampaguita HC",
      active: "portal",
      accounts: rows,
      pendingCount: rows.filter((r) => !r.is_verified).length,
    });
  } catch (e) {
    next(e);
  }
});

// ---- VERIFY  POST /portal-accounts/:id/verify --------------------------------
router.post("/portal-accounts/:id/verify", async (req, res, next) => {
  try {
    // An account created without an ID has NULL in both columns. Verifying it
    // has to record which ID was finally checked, or the clinic ends up with a
    // "Verified" badge and no answer to "verified against what?". The form on
    // an already-identified account sends neither field and this is a no-op.
    const idType = (req.body.valid_id_type || "").trim();
    const idNumber = (req.body.valid_id_number || "").trim();
    if (idType && !ID_TYPES.includes(idType))
      return res.redirect(safeBack(req.body.back, "/portal-accounts"));
    await db.query(
      `UPDATE patient_accounts
          SET is_verified = true,
              valid_id_type   = COALESCE(NULLIF($2, ''), valid_id_type),
              valid_id_number = COALESCE(NULLIF($3, ''), valid_id_number)
        WHERE account_id = $1`,
      [req.params.id, idType, idNumber]
    );
    res.redirect(safeBack(req.body.back, "/portal-accounts"));
  } catch (e) {
    next(e);
  }
});

// ---- RESET  POST /portal-accounts/:id/reset -----------------------------------
// Issues a NEW temp password (hashed; shown once). This IS the portal's
// forgot-password flow — the patient presents a valid ID at the desk.
router.post("/portal-accounts/:id/reset", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "SELECT account_id, patient_id, username FROM patient_accounts WHERE account_id = $1",
      [req.params.id]
    );
    if (!rows[0]) return next();
    const acct = rows[0];

    const tempPassword = genCode();
    // password_changed_at is cleared: whatever the patient had chosen is gone,
    // and this account is back on a staff-issued temporary password until they
    // pick a new one. The patient page reads exactly this to say so.
    await db.query(
      `UPDATE patient_accounts
          SET password_hash=$1, temp_issued_at=now(), temp_issued_by=$2,
              password_changed_at=NULL
        WHERE account_id=$3`,
      [await bcrypt.hash(tempPassword, 10), req.session.user.user_id, acct.account_id]
    );

    // A patient asking for a reset at the desk is often asking precisely
    // because someone else has been using their account. Any browser still
    // signed in as them is signed out here.
    await endOtherPatientSessions(acct.patient_id, req.sessionID);

    req.session.oneTimeSecret = {
      patient_id: acct.patient_id,
      username: acct.username,
      temp_password: tempPassword,
      kind: "reset",
    };
    res.redirect(`/patients/${acct.patient_id}`);
  } catch (e) {
    next(e);
  }
});

// ---- GUIDED STEP  GET /patients/:id/portal-account/new ------------------------
// Where POST /patients lands a freshly-created record, so every new patient
// gets walked through account setup instead of it being a card buried on the
// profile page that's easy to scroll past. Skippable — no valid ID, no account.
router.get("/patients/:id/portal-account/new", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "SELECT patient_id, patient_number, full_name FROM patients WHERE patient_id = $1",
      [req.params.id]
    );
    if (!rows[0]) return next();
    const patient = rows[0];
    const chain = req.query.next === "book" ? "book" : "";

    // Already has one (e.g. someone hit Back) — don't offer to make a second.
    const existing = await db.query(
      "SELECT 1 FROM patient_accounts WHERE patient_id = $1", [patient.patient_id]
    );
    if (existing.rowCount) {
      return res.redirect(
        chain ? `/appointments/new?patient_id=${patient.patient_id}&next=book` : `/patients/${patient.patient_id}`
      );
    }

    res.render("portal-accounts/new", {
      title: `Portal account — ${patient.full_name} · Sampaguita HC`,
      active: "patients",
      patient,
      suggestedUsername: await uniqueUsername(suggestUsername(patient.full_name)),
      idTypes: ID_TYPES,
      noIdValue: NO_ID,
      next: chain,
      error: req.query.acct_err || null,
    });
  } catch (e) {
    next(e);
  }
});

// ---- CREATE at the desk  POST /patients/:id/portal-account --------------------
// Staff checked the physical ID → the account is born verified.
router.post("/patients/:id/portal-account", async (req, res, next) => {
  try {
    const patient_id = parseInt(req.params.id, 10);
    const username = (req.body.username || "").trim().toLowerCase();
    const valid_id_type = (req.body.valid_id_type || "").trim();
    const valid_id_number = (req.body.valid_id_number || "").trim();
    const chain = req.body.next === "book" ? "book" : "";

    const patientQ = await db.query(
      "SELECT patient_id FROM patients WHERE patient_id = $1", [patient_id]
    );
    if (!patientQ.rows[0]) return next();

    // Errors go back to whichever form was submitted: the guided step page, or
    // the account card on the profile page.
    const back = req.body.form === "guided"
      ? `/patients/${patient_id}/portal-account/new${chain ? "?next=book" : ""}`
      : `/patients/${patient_id}`;
    const oops = (msg) =>
      res.redirect(`${back}${back.includes("?") ? "&" : "?"}acct_err=${encodeURIComponent(msg)}`);

    if (!USERNAME_RE.test(username))
      return oops("Username must be 4–30 characters: lowercase letters, numbers, dots or underscores.");
    // "No ID on hand" is an answer, and the only one that produces an
    // unverified account. Everything else must name an ID *and* its number,
    // because an ID type with no number recorded is not evidence of anything.
    const noId = valid_id_type === NO_ID;
    if (!noId && !ID_TYPES.includes(valid_id_type))
      return oops("Choose which valid ID was presented, or “No ID on hand”.");
    if (!noId && !valid_id_number) return oops("Enter the valid ID number.");

    const existing = await db.query(
      "SELECT 1 FROM patient_accounts WHERE patient_id = $1", [patient_id]
    );
    if (existing.rowCount) return oops("This patient already has a portal account.");

    const taken = await db.query(
      "SELECT 1 FROM patient_accounts WHERE lower(username) = $1", [username]
    );
    if (taken.rowCount) return oops("That username is already taken.");

    const tempPassword = genCode();
    try {
      await db.query(
        `INSERT INTO patient_accounts
           (patient_id, username, password_hash, valid_id_type, valid_id_number, is_verified,
            temp_issued_at, temp_issued_by)
         VALUES ($1,$2,$3,$4,$5,$6,now(),$7)`,
        // NULL, not the sentinel: the columns mean "the ID we checked", and
        // there wasn't one. The account is born unverified and shows up in
        // the pending list on /portal-accounts until somebody checks an ID.
        [patient_id, username, await bcrypt.hash(tempPassword, 10),
         noId ? null : valid_id_type, noId ? null : valid_id_number, !noId,
         req.session.user.user_id]
      );
    } catch (e) {
      // Two staff at two desks can pass the SELECT above at the same moment;
      // the UNIQUE constraint catches the loser here. Same message, not a 500.
      if (e.code === "23505") return oops("That username is already taken.");
      throw e;
    }

    req.session.oneTimeSecret = {
      patient_id,
      username,
      temp_password: tempPassword,
      kind: "created",
      unverified: noId,
    };
    // Always via the profile page — that's where the one-time credentials are
    // shown, so the booking chain must not jump straight past them.
    res.redirect(`/patients/${patient_id}${chain ? "?next=book" : ""}`);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
