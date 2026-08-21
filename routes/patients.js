// ============================================================================
// routes/patients.js — Patient records CRUD (M2)
// All routes already sit behind requireLogin (mounted after the gate in server.js).
// Patient numbers are auto-generated as SAMP-YYYY-#### (per-year sequence).
// Panel rule: a minor must have a guardian name + recorded guardian consent.
// ============================================================================
const express = require("express");
const db = require("../db");
const F = require("../lib/format");
const ID_TYPES = require("../lib/idTypes");
const audit = require("../lib/audit");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

// Whitelisted sort orders for the patient list. The SQL fragment is only ever
// read from this object (never from the query string), so it can be
// interpolated into the ORDER BY safely.
const SORTS = {
  newest: { label: "Newest first", sql: "created_at DESC" },
  oldest: { label: "Oldest first", sql: "created_at ASC" },
  name_asc: { label: "Name A → Z", sql: "lower(full_name) ASC" },
  name_desc: { label: "Name Z → A", sql: "lower(full_name) DESC" },
};

// Relations offered on the emergency-contact dropdown. "Other" reveals a free
// text box, so anything already typed before this dropdown existed still
// round-trips instead of being silently dropped on the next edit.
const RELATIONS = [
  "Mother", "Father", "Sibling", "Grandparent", "Aunt", "Uncle",
  "Wife", "Husband", "Child", "Friend", "Neighbor", "Colleague",
];

// ---- helpers ---------------------------------------------------------------

// Contact numbers are stored as digits only. Staff were typing the same number
// four different ways ("0917 123 4567", "(02) 8123-4567", "+639171234567"), so
// the same person's contact never matched twice in a search — and digits-only
// is what services/sms.js normalizePH() wants anyway. The 7–15 bound is
// deliberately wide: 7 covers a bare landline, 15 is the E.164 maximum, so
// every legitimate way of writing a number passes and only junk is rejected.
const digitsOnly = (s) => (s || "").replace(/\D/g, "");
const isPhone = (s) => /^\d{7,15}$/.test(s || "");

// "Other" on the relation dropdown means "read the free-text box beside it".
function readRelation(body) {
  const picked = (body.family_contact_relation || "").trim();
  if (picked === "__other__") return (body.family_contact_relation_other || "").trim() || null;
  return picked || null;
}

// Next human-facing patient number for the current year, e.g. SAMP-2026-0007.
async function nextPatientNumber() {
  const year = new Date().getFullYear();
  const prefix = `SAMP-${year}-`;
  const { rows } = await db.query(
    `SELECT patient_number FROM patients
      WHERE patient_number LIKE $1
      ORDER BY patient_number DESC LIMIT 1`,
    [prefix + "%"]
  );
  let n = 1;
  if (rows[0]) {
    const tail = parseInt(rows[0].patient_number.split("-").pop(), 10);
    if (!Number.isNaN(tail)) n = tail + 1;
  }
  return prefix + String(n).padStart(4, "0");
}

// Next household/family number for the current year, e.g. 26-00, 26-01…
// (teammate spec: 2-digit year, sequence starting at 00 — separate scheme
// from patient_number since one family groups several patients). Only rows
// that already match the YY-N pattern count toward the sequence, so old
// free-text values entered before this existed don't break the count.
async function nextFamilyNumber() {
  const yy = String(new Date().getFullYear()).slice(-2);
  const { rows } = await db.query(
    `SELECT max(split_part(family_number, '-', 2)::int) AS max_seq
       FROM patients
      WHERE family_number ~ '^\\d{2}-\\d+$' AND split_part(family_number, '-', 1) = $1`,
    [yy]
  );
  const n = rows[0].max_seq === null ? 0 : rows[0].max_seq + 1;
  return `${yy}-${String(n).padStart(2, "0")}`;
}

// Patients for the "link to existing family member" search on the form —
// staff search by a name they actually know, instead of needing to remember
// or copy-paste a household number.
async function loadFamilyLookup(excludeId) {
  const { rows } = await db.query(
    excludeId
      ? `SELECT patient_id, patient_number, full_name, family_number FROM patients
          WHERE patient_id <> $1 ORDER BY full_name LIMIT 500`
      : `SELECT patient_id, patient_number, full_name, family_number FROM patients
          ORDER BY full_name LIMIT 500`,
    excludeId ? [excludeId] : []
  );
  return rows;
}

// Other patients sharing a family number, for a friendly "linked with
// Name, Name" display instead of ever showing the raw code to staff.
async function loadFamilyMembers(family_number, excludeId) {
  if (!family_number) return [];
  const { rows } = await db.query(
    "SELECT patient_id, full_name, patient_number FROM patients WHERE family_number=$1 AND patient_id<>$2 ORDER BY full_name",
    [family_number, excludeId || 0]
  );
  return rows;
}

// Works out which household this patient ends up in and pulls the relatives
// picked on the form into it. Runs on save, not when staff click a name, so
// abandoning the form leaves everyone else untouched.
//
// A household is one shared number, so this scales to a family of any size: the
// third and fourth members simply join the number the first two already have.
// Someone who already belongs to a DIFFERENT household is skipped rather than
// silently moved — pulling a person out of one family and into another is not
// something to do behind staff's back, so their name is reported back instead.
async function resolveFamily(p, excludeId) {
  const ids = (p.family_join_ids || "")
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isInteger(n) && n > 0 && n !== Number(excludeId));

  if (!ids.length) return { family_number: p.family_number, joined: [], skipped: [] };

  const { rows } = await db.query(
    "SELECT patient_id, full_name, family_number FROM patients WHERE patient_id = ANY($1)",
    [ids]
  );

  // Prefer a household that already exists over minting a new number.
  const existing = rows.find((r) => r.family_number);
  const target =
    p.family_number || (existing && existing.family_number) || (await nextFamilyNumber());

  const joined = [];
  const skipped = [];
  for (const r of rows) {
    if (r.family_number === target) continue;
    if (r.family_number) { skipped.push(r.full_name); continue; }
    await db.query(
      "UPDATE patients SET family_number=$1, updated_at=now() WHERE patient_id=$2",
      [target, r.patient_id]
    );
    joined.push(r);
  }
  return { family_number: target, joined, skipped };
}

// Minor status is never taken from the client — always derived from birthdate
// (professor's revision note: "auto-calculate from birthdate").
function calcIsMinor(birthdate) {
  if (!birthdate) return false;
  const bd = new Date(birthdate);
  if (Number.isNaN(bd.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age < 18;
}

// Pull + normalize the patient fields from a submitted form.
function readForm(body) {
  const birthdate = body.birthdate || null;
  return {
    full_name: (body.full_name || "").trim(),
    birthdate,
    sex: body.sex || null,
    address: (body.address || "").trim() || null,
    contact_number: digitsOnly(body.contact_number) || null,
    email: (body.email || "").trim().toLowerCase() || null,
    family_number: (body.family_number || "").trim() || null,
    // Relatives queued on the form but not yet in any household — resolved by
    // resolveFamily() at save time. Kept as the raw string so a failed
    // validation round-trip can hand it straight back to the form.
    family_join_ids: (body.family_join_ids || "").trim(),
    family_contact_name: (body.family_contact_name || "").trim() || null,
    family_contact_relation: readRelation(body),
    family_contact_number: digitsOnly(body.family_contact_number) || null,
    family_email: (body.family_email || "").trim().toLowerCase() || null,
    // How this patient wants to be reminded. Defaults to both so an existing
    // record that predates the field behaves exactly as it always did.
    reminder_channel: REMINDER_CHANNELS.includes(body.reminder_channel) ? body.reminder_channel : "both",
    is_minor: calcIsMinor(birthdate),
    guardian_name: (body.guardian_name || "").trim() || null,
    guardian_consent: body.guardian_consent === "on" || body.guardian_consent === "true",
    privacy_consent: body.privacy_consent === "on" || body.privacy_consent === "true",
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REMINDER_CHANNELS = ["both", "email", "sms", "none"];

// Shared validation. Returns an array of error strings (empty = valid).
function validate(p) {
  const errors = [];
  if (!p.full_name) errors.push("Full name is required.");
  if (p.email && !EMAIL_RE.test(p.email)) errors.push("Patient email is not a valid email address.");
  if (p.family_email && !EMAIL_RE.test(p.family_email)) errors.push("Family email is not a valid email address.");
  // Choosing a channel this record has no address for would quietly mean "never
  // remind this patient" — which is a real option, but it should be the one
  // that was actually chosen.
  if (p.reminder_channel === "email" && !p.email && !p.family_email)
    errors.push("You chose email reminders, but there is no email address on this record. Add one, or pick another way to remind them.");
  if (p.reminder_channel === "sms" && !p.contact_number && !p.family_contact_number)
    errors.push("You chose SMS reminders, but there is no mobile number on this record. Add one, or pick another way to remind them.");
  if (p.sex && !["male", "female"].includes(p.sex)) errors.push("Invalid sex.");
  // Panel requirement: minors need guardian + consent.
  if (p.is_minor) {
    if (!p.guardian_name) errors.push("Guardian name is required for a minor.");
    if (!p.guardian_consent)
      errors.push("Guardian consent must be recorded for a minor.");
  }
  // Every record must carry ONE reachable number — the patient's own, or the
  // emergency contact's for anyone without a phone (infants, most elderly).
  // Requiring the patient's own outright would dead-end those registrations.
  if (p.contact_number && !isPhone(p.contact_number))
    errors.push("Patient contact # must be 7–15 digits, numbers only (e.g. 09171234567).");
  if (p.family_contact_number && !isPhone(p.family_contact_number))
    errors.push("Emergency contact # must be 7–15 digits, numbers only (e.g. 09171234567).");
  if (!p.contact_number && !p.family_contact_number)
    errors.push("A contact number is required — either the patient's own, or the emergency contact's.");
  if (!p.privacy_consent) errors.push("Data privacy consent must be recorded.");
  return errors;
}

// ---- LIST  /patients  (with simple search) ---------------------------------
router.get("/patients", async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    const sort = SORTS[req.query.sort] ? req.query.sort : "newest";
    // "By household" gathers the family groups that were, until now, only
    // visible one patient at a time on each profile page.
    const view = req.query.view === "household" ? "household" : "list";
    const order =
      view === "household"
        ? "family_number NULLS LAST, birthdate ASC NULLS LAST, lower(full_name)"
        : SORTS[sort].sql;

    const { rows } = await db.query(
      `SELECT patient_id, patient_number, full_name, sex, birthdate,
              contact_number, is_minor, family_number
         FROM patients
        ${q ? "WHERE full_name ILIKE $1 OR patient_number ILIKE $1 OR contact_number ILIKE $1" : ""}
        ORDER BY ${order}
        LIMIT 200`,
      q ? [`%${q}%`] : []
    );
    res.render("patients/list", {
      title: "Patients · Sampaguita HC",
      active: "patients",
      patients: rows,
      q,
      sort,
      sorts: SORTS,
      view,
    });
  } catch (e) {
    next(e);
  }
});

// ---- QUICK SEARCH  GET /patients/search.json --------------------------------
// Feeds the dropdown under the top search bar. Registered before /patients/:id
// so "search.json" isn't read as a patient id. Deliberately a small endpoint
// rather than shipping every patient to every page: the list grows for the life
// of the clinic, and the topbar is on every single screen.
router.get("/patients/search.json", async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    if (q.length < 2) return res.json([]);
    const { rows } = await db.query(
      `SELECT patient_id, patient_number, full_name, is_minor
         FROM patients
        WHERE full_name ILIKE $1 OR patient_number ILIKE $1 OR contact_number ILIKE $1
        ORDER BY lower(full_name)
        LIMIT 8`,
      [`%${q}%`]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// ---- NEW form  /patients/new ----------------------------------------------
router.get("/patients/new", async (req, res, next) => {
  try {
    res.render("patients/form", {
      title: "Add patient · Sampaguita HC",
      active: "patients",
      mode: "new",
      patient: {},
      familyLookup: await loadFamilyLookup(),
      familyMembers: [],
      relations: RELATIONS,
      next: req.query.next === "book" ? "book" : "",
      errors: [],
    });
  } catch (e) {
    next(e);
  }
});

// ---- CREATE  POST /patients ------------------------------------------------
router.post("/patients", async (req, res, next) => {
  const p = readForm(req.body);
  const errors = validate(p);
  if (errors.length) {
    return res.status(400).render("patients/form", {
      title: "Add patient · Sampaguita HC",
      active: "patients",
      mode: "new",
      patient: p,
      familyLookup: await loadFamilyLookup(),
      familyMembers: await loadFamilyMembers(p.family_number),
      relations: RELATIONS,
      next: req.body.next === "book" ? "book" : "",
      errors,
    });
  }
  try {
    const fam = await resolveFamily(p, null);
    p.family_number = fam.family_number;

    const patient_number = await nextPatientNumber();
    const { rows } = await db.query(
      `INSERT INTO patients
         (patient_number, full_name, birthdate, sex, address, contact_number, email,
          family_number, family_contact_name, family_contact_relation, family_contact_number, family_email,
          reminder_channel, is_minor, guardian_name, guardian_consent, privacy_consent, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING patient_id`,
      [
        patient_number, p.full_name, p.birthdate, p.sex, p.address,
        p.contact_number, p.email, p.family_number, p.family_contact_name, p.family_contact_relation,
        p.family_contact_number, p.family_email, p.reminder_channel, p.is_minor, p.guardian_name,
        p.guardian_consent, p.privacy_consent, req.session.user.user_id,
      ]
    );
    audit.log(req.session.user.user_id, "create", "patient", rows[0].patient_id, p.full_name);
    fam.joined.forEach((m) =>
      audit.log(req.session.user.user_id, "update", "patient", m.patient_id,
        `added to the household of ${p.full_name}`)
    );
    // Straight into the portal-account step (skippable) instead of dropping
    // staff on the profile page and hoping they scroll to the account card —
    // teammates' note: "para sure na magkaka-acc mga patients".
    const chain = req.body.next === "book" ? "?next=book" : "";
    res.redirect(`/patients/${rows[0].patient_id}/portal-account/new${chain}`);
  } catch (e) {
    next(e);
  }
});

// ---- VIEW  /patients/:id ---------------------------------------------------
router.get("/patients/:id", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT p.*, u.full_name AS created_by_name
         FROM patients p
         LEFT JOIN users u ON u.user_id = p.created_by
        WHERE p.patient_id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return next();

    const [appts, acctQ, dispensesQ, familyMembers, visitsQ, sharedQ] = await Promise.all([
      db.query(
        `SELECT a.appointment_id, a.appointment_date, a.appointment_time, a.status,
                s.name AS service_name
           FROM appointments a
           JOIN services s ON s.service_id = a.service_id
          WHERE a.patient_id = $1
          ORDER BY a.appointment_date DESC, a.appointment_time NULLS LAST
          LIMIT 50`,
        [req.params.id]
      ),
      db.query(
        `SELECT a.account_id, a.username, a.valid_id_type, a.valid_id_number, a.is_verified,
                a.created_at, a.temp_issued_at, a.password_changed_at,
                u.full_name AS temp_issued_by_name
           FROM patient_accounts a
           LEFT JOIN users u ON u.user_id = a.temp_issued_by
          WHERE a.patient_id = $1`,
        [req.params.id]
      ),
      db.query(
        `SELECT d.dispense_id, d.quantity, d.dispensed_at, d.notes,
                m.medicine_id, m.name AS medicine_name, m.unit
           FROM medicine_dispenses d
           JOIN medicines m ON m.medicine_id = d.medicine_id
          WHERE d.patient_id = $1
          ORDER BY d.dispensed_at DESC
          LIMIT 50`,
        [req.params.id]
      ),
      loadFamilyMembers(rows[0].family_number, req.params.id),
      // Anyone else reachable at this same address. Sharing one is allowed and
      // ordinary — a mother's inbox is often the only one a family has — but it
      // has to be visible, because a password reset sent here reaches all of
      // them, and because a duplicate is just as often a typing slip.
      rows[0].email
        ? db.query(
            `SELECT patient_id, full_name
               FROM patients
              WHERE lower(trim(email)) = lower(trim($1)) AND patient_id <> $2
              ORDER BY full_name`,
            [rows[0].email, req.params.id]
          )
        : Promise.resolve({ rows: [] }),
      db.query(
        `SELECT v.visit_id, v.visit_date, v.bp_systolic, v.bp_diastolic, v.weight_kg,
                v.height_cm, v.temperature_c, v.diagnosis, v.consultation_notes,
                a.full_name AS attended_by_name
           FROM visits v
           LEFT JOIN users a ON a.user_id = v.attended_by
          WHERE v.patient_id = $1
          ORDER BY v.visit_date DESC, v.visit_id DESC
          LIMIT 50`,
        [req.params.id]
      ),
    ]);

    // One-time credentials flash (set by portal-account create/reset) — read once, then gone.
    let secrets = null;
    if (req.session.oneTimeSecret &&
        req.session.oneTimeSecret.patient_id === rows[0].patient_id) {
      secrets = req.session.oneTimeSecret;
      delete req.session.oneTimeSecret;
    }

    res.render("patients/view", {
      title: `${rows[0].full_name} · Sampaguita HC`,
      active: "patients",
      patient: rows[0],
      appointments: appts.rows,
      dispenses: dispensesQ.rows,
      visits: visitsQ.rows,
      canRecordVisit: ["nurse", "doctor", "admin"].includes(req.session.user.role),
      account: acctQ.rows[0] || null,
      familyMembers,
      emailSharedWith: sharedQ.rows,
      secrets,
      nextStep: req.query.next === "book" ? "book" : "",
      acctErr: req.query.acct_err || null,
      // Page-level problems (e.g. a refused delete). Kept separate from
      // acctErr, which renders inside the portal-account card far down the
      // page — a refused delete shown there looked like nothing happened.
      pageErr: req.query.err || null,
      // Not an error — something staff asked for that only partly happened
      // (e.g. a relative who already belongs to another household).
      pageNote: req.query.fam_note || null,
      idTypes: ID_TYPES,
      pretty: F.prettyService,
      shortTime: F.shortTime,
      longDate: F.longDate,
    });
  } catch (e) {
    next(e);
  }
});

// ---- EDIT form  /patients/:id/edit ----------------------------------------
router.get("/patients/:id/edit", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM patients WHERE patient_id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return next();
    res.render("patients/form", {
      title: "Edit patient · Sampaguita HC",
      active: "patients",
      mode: "edit",
      patient: rows[0],
      familyLookup: await loadFamilyLookup(req.params.id),
      familyMembers: await loadFamilyMembers(rows[0].family_number, req.params.id),
      relations: RELATIONS,
      next: "",
      errors: [],
    });
  } catch (e) {
    next(e);
  }
});

// ---- UPDATE  POST /patients/:id -------------------------------------------
router.post("/patients/:id", async (req, res, next) => {
  const p = readForm(req.body);
  const errors = validate(p);
  if (errors.length) {
    return res.status(400).render("patients/form", {
      title: "Edit patient · Sampaguita HC",
      active: "patients",
      mode: "edit",
      patient: { ...p, patient_id: req.params.id },
      familyLookup: await loadFamilyLookup(req.params.id),
      familyMembers: await loadFamilyMembers(p.family_number, req.params.id),
      relations: RELATIONS,
      next: "",
      errors,
    });
  }
  try {
    // Refuse to save on top of someone else's change. Two staff with the same
    // patient open — which is ordinary in a clinic with one shared desk, and
    // more so when they're signed in to the same account — each submit the
    // WHOLE form, so the second save silently restores every field the first
    // one had changed. Both saw "saved". Neither was told.
    //
    // `seen_at` is the updated_at the form was rendered with; it is compared
    // inside the UPDATE, so nothing can slip between the check and the write.
    // Compared at millisecond precision because Postgres keeps microseconds and
    // a JavaScript Date does not.
    const seenAt = Date.parse(req.body.seen_at || "");
    const guarded = Number.isFinite(seenAt);

    // The family fields are written first so that a lost race changes nothing
    // for anybody: this UPDATE touches only this patient, and the relatives are
    // pulled in further down, after the save is known to have won.
    const stale = guarded
      ? await db.query(
          `SELECT 1 FROM patients
            WHERE patient_id=$1 AND date_trunc('milliseconds', updated_at) <> $2`,
          [req.params.id, new Date(seenAt)]
        )
      : { rowCount: 0 };

    if (stale.rowCount) {
      const current = await db.query("SELECT * FROM patients WHERE patient_id=$1", [req.params.id]);
      if (!current.rows[0]) return next();
      return res.status(409).render("patients/form", {
        title: "Edit patient · Sampaguita HC",
        active: "patients",
        mode: "edit",
        patient: current.rows[0],   // redraw with what's actually saved now
        familyLookup: await loadFamilyLookup(req.params.id),
        familyMembers: await loadFamilyMembers(current.rows[0].family_number, req.params.id),
        relations: RELATIONS,
        next: "",
        errors: [
          "Someone else saved changes to this patient while this page was open. " +
            "Nothing was saved, so their work isn't lost. What's on screen now is the current record — make your change again on top of it.",
        ],
      });
    }

    const fam = await resolveFamily(p, req.params.id);
    p.family_number = fam.family_number;

    const { rowCount } = await db.query(
      `UPDATE patients SET
         full_name=$1, birthdate=$2, sex=$3, address=$4, contact_number=$5, email=$6,
         family_number=$7, family_contact_name=$8, family_contact_relation=$9, family_contact_number=$10,
         family_email=$11, reminder_channel=$12, is_minor=$13, guardian_name=$14, guardian_consent=$15,
         privacy_consent=$16, updated_at=now()
       WHERE patient_id=$17
         ${guarded ? "AND date_trunc('milliseconds', updated_at) = $18" : ""}`,
      [
        p.full_name, p.birthdate, p.sex, p.address, p.contact_number, p.email,
        p.family_number, p.family_contact_name, p.family_contact_relation, p.family_contact_number,
        p.family_email, p.reminder_channel, p.is_minor, p.guardian_name, p.guardian_consent,
        p.privacy_consent, req.params.id,
        ...(guarded ? [new Date(seenAt)] : []),
      ]
    );
    if (!rowCount) return next();
    audit.log(req.session.user.user_id, "update", "patient", req.params.id, p.full_name);
    fam.joined.forEach((m) =>
      audit.log(req.session.user.user_id, "update", "patient", m.patient_id,
        `added to the household of ${p.full_name}`)
    );

    // Anyone who couldn't be pulled in has to be said out loud, or staff would
    // walk away believing a link was made that wasn't.
    const note = fam.skipped.length
      ? `?fam_note=${encodeURIComponent(
          `${fam.skipped.join(", ")} ${fam.skipped.length === 1 ? "is" : "are"} already in another household, so ${fam.skipped.length === 1 ? "that patient was" : "those patients were"} not added. Remove them from that household first if this is the correct family.`
        )}`
      : "";
    res.redirect(`/patients/${req.params.id}${note}`);
  } catch (e) {
    next(e);
  }
});

// ---- DELETE  POST /patients/:id/delete (admin only) -------------------------
// FK ON DELETE CASCADE (appointments, patient_accounts, visits) means this
// removes every record tied to the patient, not just the patients row.
router.post("/patients/:id/delete", requireRole("admin"), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "DELETE FROM patients WHERE patient_id=$1 RETURNING full_name",
      [req.params.id]
    );
    if (!rows[0]) return next();
    audit.log(req.session.user.user_id, "delete", "patient", req.params.id, rows[0].full_name);
    res.redirect("/patients");
  } catch (e) {
    // medicine_dispenses has no ON DELETE CASCADE (medicine history is kept on
    // purpose) — a patient with dispense records can't be hard-deleted. Goes to
    // `err`, not `acct_err`: the latter renders inside the portal-account card
    // near the bottom of the page, so a refused delete read as a silent no-op.
    if (e.code === "23503") {
      return res.redirect(
        `/patients/${req.params.id}?err=${encodeURIComponent(
          "This patient was NOT deleted. Medicine has been dispensed to them, and that stock record has to stay for the inventory to balance. Only patients with no dispense history can be removed."
        )}`
      );
    }
    next(e);
  }
});

module.exports = router;
