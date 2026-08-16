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
const ID_TYPES = require("../lib/idTypes");

const router = express.Router();

const USERNAME_RE = /^[a-z0-9._]{4,30}$/;

function genCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += alphabet[bytes[i] % alphabet.length];
    if (i === 3) s += "-";
  }
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
    await db.query(
      "UPDATE patient_accounts SET is_verified = true WHERE account_id = $1",
      [req.params.id]
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
    await db.query(
      "UPDATE patient_accounts SET password_hash=$1 WHERE account_id=$2",
      [await bcrypt.hash(tempPassword, 10), acct.account_id]
    );

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
    if (!ID_TYPES.includes(valid_id_type)) return oops("Choose which valid ID was presented.");
    if (!valid_id_number) return oops("Enter the valid ID number.");

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
           (patient_id, username, password_hash, valid_id_type, valid_id_number, is_verified)
         VALUES ($1,$2,$3,$4,$5,true)`,
        [patient_id, username, await bcrypt.hash(tempPassword, 10),
         valid_id_type, valid_id_number]
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
    };
    // Always via the profile page — that's where the one-time credentials are
    // shown, so the booking chain must not jump straight past them.
    res.redirect(`/patients/${patient_id}${chain ? "?next=book" : ""}`);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
