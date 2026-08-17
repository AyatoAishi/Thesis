// ============================================================================
// routes/portal.js — the PATIENT portal (M5). Public + its own session gate.
//
// Flow: accounts are created BY STAFF at the desk, after they have physically
// checked the patient's valid ID — see routes/portalAccounts.js. There is no
// self-signup: this is a small barangay clinic, patients only learn the portal
// exists when staff tell them at the counter and hand over their credentials,
// so a public registration form bought nothing and added a way for unverified
// accounts to pile up.
//
// Patients here READ. They do not book, cancel, or reschedule: the clinic owns
// the schedule, because the staff at the desk are the only ones who can see the
// whole day, the queue in the waiting area, and whether the midwife is even in.
// An online booking that the clinic hasn't agreed to isn't an appointment, it's
// a surprise. That call is the client's, and the code for it is gone rather
// than merely hidden behind a flag — a disabled feature still rots.
//
// Security rules:
//   - Every data query keys off req.session.patient.patient_id (never the URL).
//   - Generic error messages on login (no record enumeration).
//   - Health records are gated on is_verified, read fresh from the DB.
//   - Passwords are bcrypt-hashed, never stored or emailed in the clear.
// ============================================================================
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const F = require("../lib/format");
const { buildCard } = require("../lib/immunizationCard");
const { requirePatient } = require("../middleware/portalAuth");

const router = express.Router();

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

    // Same hardening as the staff side: a fresh session ID once this browser is
    // authenticated (session fixation), the staff half carried across, and the
    // session written to Postgres BEFORE the redirect so the portal can't be
    // reached a beat before the session exists.
    const staffHalf = req.session.user;
    req.session.regenerate((regenErr) => {
      if (regenErr) return next(regenErr);
      if (staffHalf) req.session.user = staffHalf;
      req.session.patient = { account_id: acct.account_id, patient_id: acct.patient_id };
      req.session.save((saveErr) => (saveErr ? next(saveErr) : res.redirect("/portal")));
    });
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

// Self-signup is gone (see the header). Old links/bookmarks would otherwise
// fall through to the STAFF sign-in page, which is the wrong door entirely.
router.all("/portal/signup", (req, res) => res.redirect("/portal/login"));

// ---- FORGOT PASSWORD ---------------------------------------------------------
// Instructions only — there is no self-service reset. A recovery code the
// patient carries is nearly self-defeating: someone who has lost their password
// has almost certainly lost the slip of paper too. Email can't replace it
// either, since only about half the patients here have an address on file, and
// the ones who don't are mostly the elderly who need help the most.
//
// So recovery is what it already was in practice: the patient walks in, staff
// check the ID they can see, and hit Reset (routes/portalAccounts.js) to issue
// a fresh temporary password. Nothing to steal, nothing to expire, works for
// every patient.
router.get("/portal/recover", (req, res) => {
  res.render("portal/recover", {
    title: "Nakalimutang password · Sampaguita HC",
    layout: false,
  });
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

    // Stamping the change is what lets the staff page stop saying "still on the
    // temporary password we handed out" — the only visible sign that the
    // patient ever did this, since the password itself is never readable.
    await db.query(
      `UPDATE patient_accounts
          SET password_hash = $1, password_changed_at = now()
        WHERE account_id = $2`,
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
    const [apptsQ, visitsQ, medsQ, immCard, prenatalQ, dependents] = await Promise.all([
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
      flash: {
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

module.exports = router;
