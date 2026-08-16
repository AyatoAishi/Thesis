// ============================================================================
// routes/portal.js — the PATIENT portal (M5). Public + its own session gate.
//
// Flow: a patient self-signs-up by matching their clinic record (patient number
// + full name + birthdate) and choosing a username/password. The account starts
// UNVERIFIED — staff verify a physical valid ID at the clinic. Verified
// patients can view their visit records and book/cancel appointments online.
//
// Security rules:
//   - Every data query keys off req.session.patient.patient_id (never the URL).
//   - Generic error messages on login/signup/recover (no record enumeration).
//   - Booking re-checks is_verified from the DB, not the session.
//   - Passwords AND recovery codes are bcrypt-hashed (RA 10173).
// ============================================================================
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db");
const F = require("../lib/format");
const ID_TYPES = require("../lib/idTypes");
const { buildCard } = require("../lib/immunizationCard");
const { requirePatient } = require("../middleware/portalAuth");
const { sendBookingConfirmation } = require("../services/reminders");

const router = express.Router();

const MAX_OPEN_BOOKINGS = 3;   // open 'scheduled' appointments a patient may hold
const BOOKING_HORIZON = 90;    // how far ahead (days) online booking is allowed

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const USERNAME_RE = /^[a-z0-9._]{4,30}$/;
const normName = (s) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();

// Human-friendly random code (no 0/O/1/I/L), e.g. "K7MP-2XWQ".
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

// ---- LOGIN ------------------------------------------------------------------
router.get("/portal/login", (req, res) => {
  if (req.session.patient) return res.redirect("/portal");
  res.render("portal/login", {
    title: "Patient portal · Sampaguita HC",
    layout: false,
    error: null,
    username: "",
    notice: req.query.reset ? "Password updated — you can sign in now." : null,
  });
});

router.post("/portal/login", async (req, res, next) => {
  try {
    const username = (req.body.username || "").trim().toLowerCase();
    const password = req.body.password || "";
    const fail = () =>
      res.status(401).render("portal/login", {
        title: "Patient portal · Sampaguita HC",
        layout: false,
        error: "Incorrect username or password.",
        username,
        notice: null,
      });

    if (!username || !password) return fail();
    const { rows } = await db.query(
      `SELECT a.account_id, a.patient_id, a.password_hash, p.full_name
         FROM patient_accounts a
         JOIN patients p ON p.patient_id = a.patient_id
        WHERE lower(a.username) = $1`,
      [username]
    );
    const acct = rows[0];
    if (!acct || !(await bcrypt.compare(password, acct.password_hash))) return fail();

    req.session.patient = { account_id: acct.account_id, patient_id: acct.patient_id };
    res.redirect("/portal");
  } catch (e) {
    next(e);
  }
});

// Only clears the PATIENT half of the session (a staff login in the same
// browser — e.g. during a demo — stays signed in).
router.post("/portal/logout", (req, res) => {
  delete req.session.patient;
  res.redirect("/portal/login");
});

// ---- SIGNUP -----------------------------------------------------------------
function renderSignup(res, { status = 200, errors = [], form = {}, success = null } = {}) {
  return res.status(status).render("portal/signup", {
    title: "Create portal account · Sampaguita HC",
    layout: false,
    idTypes: ID_TYPES,
    errors,
    form,
    success,
  });
}

router.get("/portal/signup", (req, res) => renderSignup(res));

router.post("/portal/signup", async (req, res, next) => {
  try {
    const form = {
      patient_number: (req.body.patient_number || "").trim().toUpperCase(),
      full_name: (req.body.full_name || "").trim().replace(/\s+/g, " "),
      birthdate: (req.body.birthdate || "").trim(),
      valid_id_type: (req.body.valid_id_type || "").trim(),
      valid_id_number: (req.body.valid_id_number || "").trim(),
      username: (req.body.username || "").trim().toLowerCase(),
    };
    const password = req.body.password || "";

    const errors = [];
    if (!form.patient_number) errors.push("Patient number is required (it's on your clinic card, e.g. SAMP-2026-0001).");
    if (!form.full_name) errors.push("Full name is required.");
    if (!isDate(form.birthdate)) errors.push("Birthdate is required.");
    if (!ID_TYPES.includes(form.valid_id_type)) errors.push("Choose which valid ID you will present.");
    if (!form.valid_id_number) errors.push("Enter your valid ID number.");
    if (!USERNAME_RE.test(form.username))
      errors.push("Username must be 4–30 characters: lowercase letters, numbers, dots or underscores.");
    if (password.length < 8) errors.push("Password must be at least 8 characters.");
    if (errors.length) return renderSignup(res, { status: 400, errors, form });

    // Match a clinic record. All three must match — generic error otherwise so
    // the form can't be used to fish for who is/isn't a patient here.
    const match = await db.query(
      `SELECT patient_id FROM patients
        WHERE upper(patient_number) = $1
          AND lower(regexp_replace(full_name, '\\s+', ' ', 'g')) = $2
          AND birthdate = $3::date`,
      [form.patient_number, normName(form.full_name), form.birthdate]
    );
    if (!match.rows[0]) {
      return renderSignup(res, {
        status: 400, form,
        errors: ["We couldn't match those details to a clinic record. Please check your patient number, full name, and birthdate — or visit the clinic and the staff will set up your account."],
      });
    }
    const patient_id = match.rows[0].patient_id;

    const existing = await db.query(
      "SELECT 1 FROM patient_accounts WHERE patient_id = $1", [patient_id]
    );
    if (existing.rowCount) {
      return renderSignup(res, {
        status: 400, form,
        errors: ["This patient already has a portal account. Use “Forgot password” or ask the clinic staff for help."],
      });
    }

    const taken = await db.query(
      "SELECT 1 FROM patient_accounts WHERE lower(username) = $1", [form.username]
    );
    if (taken.rowCount) {
      return renderSignup(res, { status: 400, form, errors: ["That username is already taken — try another."] });
    }

    const recoveryCode = genCode();
    await db.query(
      `INSERT INTO patient_accounts
         (patient_id, username, password_hash, valid_id_type, valid_id_number,
          is_verified, recovery_id)
       VALUES ($1,$2,$3,$4,$5,false,$6)`,
      [patient_id, form.username, await bcrypt.hash(password, 10),
       form.valid_id_type, form.valid_id_number, await bcrypt.hash(recoveryCode, 10)]
    );

    // Show the recovery code ONCE — it is stored hashed and cannot be re-shown.
    renderSignup(res, { success: { username: form.username, recoveryCode } });
  } catch (e) {
    next(e);
  }
});

// ---- FORGOT PASSWORD (recovery code) -----------------------------------------
router.get("/portal/recover", (req, res) => {
  res.render("portal/recover", {
    title: "Reset password · Sampaguita HC",
    layout: false,
    error: null,
    username: "",
  });
});

router.post("/portal/recover", async (req, res, next) => {
  try {
    const username = (req.body.username || "").trim().toLowerCase();
    const code = (req.body.recovery_code || "").trim().toUpperCase();
    const password = req.body.password || "";
    const fail = (msg) =>
      res.status(401).render("portal/recover", {
        title: "Reset password · Sampaguita HC",
        layout: false,
        error: msg,
        username,
      });

    if (password.length < 8) return fail("New password must be at least 8 characters.");
    const { rows } = await db.query(
      "SELECT account_id, recovery_id FROM patient_accounts WHERE lower(username) = $1",
      [username]
    );
    const acct = rows[0];
    if (!acct || !acct.recovery_id || !(await bcrypt.compare(code, acct.recovery_id))) {
      return fail("Invalid username or recovery code.");
    }
    await db.query(
      "UPDATE patient_accounts SET password_hash = $1 WHERE account_id = $2",
      [await bcrypt.hash(password, 10), acct.account_id]
    );
    res.redirect("/portal/login?reset=1");
  } catch (e) {
    next(e);
  }
});

// ---- HOUSEHOLD (a guardian seeing a minor's records) --------------------------
// Deliberately narrow. The viewer sees another patient ONLY when all of these
// hold: the viewer is a verified adult, the other patient is flagged is_minor,
// and both carry the same non-empty family_number. Adult-to-adult is never
// allowed — a spouse must not stumble into family-planning or prenatal records
// through here, which is exactly the kind of disclosure RA 10173 is about.
//
// Note there is no separate "approval" table: family_number is assigned by
// clinic staff on the patient form, so grouping a household IS the approval.
const HOUSEHOLD_SQL = `
  SELECT c.patient_id, c.patient_number, c.full_name
    FROM patients c
    JOIN patients g ON g.patient_id = $1
    JOIN patient_accounts a ON a.patient_id = g.patient_id
   WHERE c.is_minor = true
     AND g.is_minor = false
     AND a.is_verified = true
     AND g.family_number IS NOT NULL
     AND c.family_number = g.family_number
     AND c.patient_id <> g.patient_id`;

async function loadDependents(guardianId) {
  const { rows } = await db.query(`${HOUSEHOLD_SQL} ORDER BY c.full_name`, [guardianId]);
  return rows;
}

router.get("/portal/household/:id", requirePatient, async (req, res, next) => {
  try {
    const guardianId = req.session.patient.patient_id;
    const childId = parseInt(req.params.id, 10) || 0;

    // Re-runs the full rule against the DB rather than trusting the URL.
    const { rows } = await db.query(
      `${HOUSEHOLD_SQL} AND c.patient_id = $2`, [guardianId, childId]
    );
    const child = rows[0];
    if (!child) {
      return res.redirect(
        `/portal?err=${encodeURIComponent("Wala kang access sa records na 'yan.")}`
      );
    }

    const [apptsQ, medsQ, immCard] = await Promise.all([
      db.query(
        `SELECT a.appointment_date, a.appointment_time, a.status, s.name AS service_name
           FROM appointments a JOIN services s ON s.service_id = a.service_id
          WHERE a.patient_id = $1
          ORDER BY a.appointment_date DESC, a.appointment_time NULLS LAST
          LIMIT 100`,
        [childId]
      ),
      db.query(
        `SELECT d.dispensed_at, d.quantity, m.name AS medicine_name, m.dosage, m.unit
           FROM medicine_dispenses d JOIN medicines m ON m.medicine_id = d.medicine_id
          WHERE d.patient_id = $1
            AND (d.requires_doctor_approval = false OR d.approved_at IS NOT NULL)
          ORDER BY d.dispensed_at DESC
          LIMIT 50`,
        [childId]
      ),
      buildCard(childId),
    ]);

    // Same "hide the empty blocks" rule as the patient's own card.
    const immCategories = ["infant", "school", "senior"]
      .map((key) => ({
        key,
        label: { infant: "Infant", school: "School-aged", senior: "Senior citizen" }[key],
        rows: immCard.schedule.filter((v) => v.category === key),
      }))
      .filter((c) => c.rows.some((v) => v.doseSlots.some((s) => s.given)));

    res.render("portal/dependent", {
      title: `${child.full_name} · Sampaguita HC`,
      layout: "portal-layout",
      me: req.session.patient,
      child,
      appointments: apptsQ.rows,
      medicines: medsQ.rows.map((m) => ({
        ...m,
        date: new Date(m.dispensed_at).toLocaleDateString("en-CA", { timeZone: F.TZ }),
      })),
      immCategories,
      immOther: immCard.other,
      pretty: F.prettyService,
      longDate: F.longDate,
      shortTime: F.shortTime,
    });
  } catch (e) {
    next(e);
  }
});

// ---- CHANGE OWN PASSWORD ------------------------------------------------------
router.post("/portal/password", requirePatient, async (req, res, next) => {
  try {
    const pid = req.session.patient.patient_id;
    const current = req.body.current_password || "";
    const password = req.body.password || "";
    const password2 = req.body.password2 || "";
    const oops = (msg) => res.redirect(`/portal?pw_err=${encodeURIComponent(msg)}`);

    if (password.length < 8) return oops("Dapat 8 characters pataas ang bagong password.");
    if (password !== password2) return oops("Hindi magkatugma ang dalawang bagong password.");

    const { rows } = await db.query(
      "SELECT account_id, password_hash FROM patient_accounts WHERE patient_id = $1", [pid]
    );
    const acct = rows[0];
    if (!acct || !(await bcrypt.compare(current, acct.password_hash))) {
      return oops("Mali ang current password mo.");
    }
    if (await bcrypt.compare(password, acct.password_hash)) {
      return oops("Pareho lang ng luma ang bagong password — pumili ng iba.");
    }

    await db.query(
      "UPDATE patient_accounts SET password_hash = $1 WHERE account_id = $2",
      [await bcrypt.hash(password, 10), acct.account_id]
    );
    res.redirect("/portal?pw=1");
  } catch (e) {
    next(e);
  }
});

// ---- HOME (the whole portal on one friendly page) -----------------------------
router.get("/portal", requirePatient, async (req, res, next) => {
  try {
    const pid = req.session.patient.patient_id;

    // Fresh account + patient (verification may have changed since login).
    const acctQ = await db.query(
      `SELECT a.account_id, a.username, a.is_verified, a.created_at,
              p.patient_id, p.patient_number, p.full_name, p.birthdate, p.sex,
              p.address, p.contact_number, p.email
         FROM patient_accounts a
         JOIN patients p ON p.patient_id = a.patient_id
        WHERE a.patient_id = $1`,
      [pid]
    );
    if (!acctQ.rows[0]) {           // account/patient removed — drop the session
      delete req.session.patient;
      return res.redirect("/portal/login");
    }
    const me = acctQ.rows[0];
    const today = F.manilaToday();

    // Everything below the appointment list is a health record, so it's gated
    // on is_verified the same way the visit list already was.
    const none = Promise.resolve({ rows: [] });
    const [apptsQ, visitsQ, services, medsQ, immCard, prenatalQ, dependents] = await Promise.all([
      db.query(
        `SELECT a.appointment_id, a.appointment_date, a.appointment_time, a.status,
                s.name AS service_name
           FROM appointments a JOIN services s ON s.service_id = a.service_id
          WHERE a.patient_id = $1
          ORDER BY a.appointment_date DESC, a.appointment_time NULLS LAST
          LIMIT 100`,
        [pid]
      ),
      me.is_verified
        ? db.query(
            `SELECT visit_date, bp_systolic, bp_diastolic, weight_kg, temperature_c, diagnosis
               FROM visits WHERE patient_id = $1
              ORDER BY visit_date DESC LIMIT 50`,
            [pid]
          )
        : none,
      db.query("SELECT service_id, name, schedule_day, description FROM services ORDER BY service_id"),
      // Only medicines that actually left the shelf — a dispense still waiting
      // on a doctor's approval hasn't been handed over yet.
      me.is_verified
        ? db.query(
            `SELECT d.dispensed_at, d.quantity, m.name AS medicine_name, m.dosage, m.unit
               FROM medicine_dispenses d JOIN medicines m ON m.medicine_id = d.medicine_id
              WHERE d.patient_id = $1
                AND (d.requires_doctor_approval = false OR d.approved_at IS NOT NULL)
              ORDER BY d.dispensed_at DESC
              LIMIT 50`,
            [pid]
          )
        : none,
      me.is_verified ? buildCard(pid) : Promise.resolve({ schedule: [], other: [] }),
      me.is_verified
        ? db.query(
            `SELECT prenatal_id, lmp, edd, gravida, para, status,
                    tt1_date, tt2_date, tt3_date, tt4_date, tt5_date
               FROM prenatal_records WHERE patient_id = $1
              ORDER BY coalesce(lmp, created_at::date) DESC, prenatal_id DESC
              LIMIT 1`,
            [pid]
          )
        : none,
      me.is_verified ? loadDependents(pid) : Promise.resolve([]),
    ]);

    // Only show vaccine categories the patient actually has doses in — an
    // adult doesn't need a wall of empty infant rows, while a parent tracking
    // a baby still sees which doses in that block are still missing.
    const immCategories = ["infant", "school", "senior"]
      .map((key) => ({
        key,
        label: { infant: "Infant", school: "School-aged", senior: "Senior citizen" }[key],
        rows: immCard.schedule.filter((v) => v.category === key),
      }))
      .filter((c) => c.rows.some((v) => v.doseSlots.some((s) => s.given)));

    // dispensed_at is a TIMESTAMPTZ, so its calendar date is resolved here in
    // the clinic's timezone rather than in the template (DATE columns come
    // back as plain 'YYYY-MM-DD' strings and need no such care).
    const medicines = medsQ.rows.map((m) => ({
      ...m,
      date: new Date(m.dispensed_at).toLocaleDateString("en-CA", { timeZone: F.TZ }),
    }));

    const prenatal = prenatalQ.rows[0] || null;
    let prenatalVisits = [];
    if (prenatal) {
      prenatalVisits = (
        await db.query(
          `SELECT visit_date, aog, bp, weight_kg, fundal_height_cm, fetal_heart_tone
             FROM prenatal_visits WHERE prenatal_id = $1
            ORDER BY visit_date DESC LIMIT 30`,
          [prenatal.prenatal_id]
        )
      ).rows;
    }

    const upcoming = apptsQ.rows
      .filter((a) => a.status === "scheduled" && a.appointment_date >= today)
      .sort((a, b) => (a.appointment_date < b.appointment_date ? -1 : 1));

    res.render("portal/home", {
      title: "My clinic portal · Sampaguita HC",
      layout: "portal-layout",
      me,
      today,
      appointments: apptsQ.rows,
      upcoming,
      visits: visitsQ.rows,
      medicines,
      immCategories,
      immOther: immCard.other,
      prenatal,
      prenatalVisits,
      dependents,
      bookOptions: services.rows,
      minBookDate: F.addDays(today, 1),
      maxBookDate: F.addDays(today, BOOKING_HORIZON),
      canBookMore: upcoming.length < MAX_OPEN_BOOKINGS,
      maxOpen: MAX_OPEN_BOOKINGS,
      flash: {
        booked: req.query.booked === "1",
        cancelled: req.query.cancelled === "1",
        err: req.query.err || null,
        pwOk: req.query.pw === "1",
        pwErr: req.query.pw_err || null,
      },
      pretty: F.prettyService,
      longDate: F.longDate,
      shortTime: F.shortTime,
    });
  } catch (e) {
    next(e);
  }
});

// ---- BOOK (verified patients only) -------------------------------------------
router.post("/portal/book", requirePatient, async (req, res, next) => {
  try {
    const pid = req.session.patient.patient_id;
    const oops = (msg) => res.redirect(`/portal?err=${encodeURIComponent(msg)}`);

    // Verification is checked against the DB — never trust the session for this.
    const acct = await db.query(
      "SELECT is_verified FROM patient_accounts WHERE patient_id = $1", [pid]
    );
    if (!acct.rows[0] || !acct.rows[0].is_verified) {
      return oops("Your account must be verified at the clinic before booking online.");
    }

    const service_id = parseInt(req.body.service_id, 10) || null;
    const date = (req.body.appointment_date || "").trim();
    const notes = (req.body.notes || "").trim().slice(0, 255) || null;

    const svcQ = await db.query(
      "SELECT name FROM services WHERE service_id = $1", [service_id]
    );
    const svc = svcQ.rows[0];
    const today = F.manilaToday();

    if (!svc) return oops("Choose a service.");
    if (!isDate(date)) return oops("Choose a date.");
    if (date <= today) return oops("Online booking starts from tomorrow — for today, please walk in.");
    if (date > F.addDays(today, BOOKING_HORIZON)) return oops("That date is too far ahead.");

    const dup = await db.query(
      `SELECT 1 FROM appointments
        WHERE patient_id=$1 AND service_id=$2 AND appointment_date=$3 AND status='scheduled'`,
      [pid, service_id, date]
    );
    if (dup.rowCount) return oops("You already have this service booked on that date.");

    const open = await db.query(
      `SELECT count(*)::int n FROM appointments
        WHERE patient_id=$1 AND status='scheduled' AND appointment_date >= $2`,
      [pid, today]
    );
    if (open.rows[0].n >= MAX_OPEN_BOOKINGS) {
      return oops(`You can hold up to ${MAX_OPEN_BOOKINGS} upcoming appointments. Cancel one first, or visit the clinic.`);
    }

    // created_by stays NULL = "booked online by the patient".
    const ins = await db.query(
      `INSERT INTO appointments (patient_id, service_id, appointment_date, notes)
       VALUES ($1,$2,$3,$4) RETURNING appointment_id`,
      [pid, service_id, date, notes]
    );
    sendBookingConfirmation(ins.rows[0].appointment_id, "booked")
      .catch((e) => console.error("[confirmation email]", e.message));

    res.redirect("/portal?booked=1");
  } catch (e) {
    next(e);
  }
});

// ---- CANCEL own upcoming appointment ------------------------------------------
router.post("/portal/cancel/:id", requirePatient, async (req, res, next) => {
  try {
    const pid = req.session.patient.patient_id;
    // Constrained to the OWN patient's future scheduled rows — nothing else.
    const { rowCount } = await db.query(
      `UPDATE appointments SET status='cancelled', updated_at=now()
        WHERE appointment_id=$1 AND patient_id=$2 AND status='scheduled'
          AND appointment_date >= $3`,
      [req.params.id, pid, F.manilaToday()]
    );
    res.redirect(rowCount ? "/portal?cancelled=1" : `/portal?err=${encodeURIComponent("That appointment can no longer be cancelled online.")}`);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
