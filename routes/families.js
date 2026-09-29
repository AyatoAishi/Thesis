// ============================================================================
// routes/families.js — the Family Record: one folder per household.
//
// "A family should have a folder where all their records are stored there.
// Wag na yung individual family member ang makikita sa patient record, better
// if 'Family Record' nalang along with their family number, and registered
// family in that folder." — the professors' review.
//
// A household is the set of patients sharing a family_number (26-0000). This
// page is that set, and everything recorded for any of them, in one place —
// which is how the clinic's own paper files are kept: by family, not by person.
//
// Read-only. Every record still belongs to, and is edited on, the individual
// patient; the folder gathers them. Two places to edit the same thing is how
// two versions of it come to exist.
// ============================================================================
const express = require("express");
const db = require("../db");
const F = require("../lib/format");
const { overdueCounts } = require("../lib/immunizationCard");
const audit = require("../lib/audit");

const router = express.Router();

const FAMILY_RE = /^\d{2}-\d{4}$/;

// ---- INDEX  GET /families ----------------------------------------------------
router.get("/families", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const overdueP = overdueCounts(null);   // for the "Overdue only" tab, same as /patients
    const { rows } = await db.query(
      `SELECT family_number,
              count(*)::int AS members,
              count(*) FILTER (WHERE is_minor)::int AS minors,
              string_agg(full_name, ', ' ORDER BY birthdate NULLS LAST, full_name) AS names
         FROM patients
        WHERE family_number IS NOT NULL
        GROUP BY family_number
       HAVING $1 = '' OR family_number ILIKE $2 OR bool_or(full_name ILIKE $2)
        ORDER BY family_number DESC`,
      [q, `%${q}%`]
    );
    res.render("families/index", {
      title: "Family records · Sampaguita HC",
      active: "patients",
      families: rows,
      overdueTotal: (await overdueP).size,
      flash: req.query.flash || null,
      q,
    });
  } catch (e) {
    next(e);
  }
});

// ---- ONE FAMILY  GET /families/:number ----------------------------------------
router.get("/families/:number", async (req, res, next) => {
  try {
    const number = String(req.params.number || "");
    if (!FAMILY_RE.test(number)) return next();

    const { rows: members } = await db.query(
      `SELECT patient_id, patient_number, full_name, sex, birthdate, is_minor,
              contact_number, email, deceased_at
         FROM patients
        WHERE family_number = $1
        ORDER BY birthdate NULLS LAST, full_name`,
      [number]
    );
    if (!members.length) return next();
    const ids = members.map((m) => m.patient_id);
    const today = F.manilaToday();

    // Everything below runs together: four independent reads, one round trip
    // of waiting instead of four.
    const [upcoming, visits, doses, dispenses, prenatal, overdue, others] = await Promise.all([
      db.query(
        `SELECT a.appointment_id, a.appointment_date, a.appointment_time, a.status, a.notes,
                s.name AS service_name, p.patient_id, p.full_name
           FROM appointments a
           JOIN services s ON s.service_id = a.service_id
           JOIN patients p ON p.patient_id = a.patient_id
          WHERE a.patient_id = ANY($1::int[]) AND a.appointment_date >= $2 AND a.status = 'scheduled'
          ORDER BY a.appointment_date, a.appointment_time NULLS LAST
          LIMIT 30`,
        [ids, today]
      ),
      db.query(
        `SELECT v.visit_id, v.visit_date AS at, v.diagnosis, p.patient_id, p.full_name
           FROM visits v JOIN patients p ON p.patient_id = v.patient_id
          WHERE v.patient_id = ANY($1::int[])
          ORDER BY v.visit_date DESC, v.visit_id DESC LIMIT 20`,
        [ids]
      ),
      db.query(
        `SELECT r.imm_id, r.given_date AS at, r.vaccine_name, r.dose_number, p.patient_id, p.full_name
           FROM immunization_records r JOIN patients p ON p.patient_id = r.patient_id
          WHERE r.patient_id = ANY($1::int[]) AND r.status = 'given' AND r.given_date IS NOT NULL
          ORDER BY r.given_date DESC LIMIT 20`,
        [ids]
      ),
      db.query(
        `SELECT d.dispense_id, d.dispensed_at AS at, d.quantity, m.name AS medicine, m.dosage, m.unit,
                p.patient_id, p.full_name
           FROM medicine_dispenses d
           JOIN medicines m ON m.medicine_id = d.medicine_id
           JOIN patients p ON p.patient_id = d.patient_id
          WHERE d.patient_id = ANY($1::int[])
          ORDER BY d.dispensed_at DESC LIMIT 20`,
        [ids]
      ),
      db.query(
        `SELECT r.prenatal_id, r.created_at AS at, r.status, r.edd, p.patient_id, p.full_name
           FROM prenatal_records r JOIN patients p ON p.patient_id = r.patient_id
          WHERE r.patient_id = ANY($1::int[])
          ORDER BY r.created_at DESC LIMIT 10`,
        [ids]
      ),
      overdueCounts(ids),
      // Everyone NOT in this family, for "Add a member" on this page.
      db.query(
        `SELECT patient_id, patient_number, full_name, family_number
           FROM patients WHERE family_number IS DISTINCT FROM $1
          ORDER BY lower(full_name) LIMIT 500`,
        [number]
      ),
    ]);

    // One timeline across the household, newest first. Each kind keeps its own
    // link, so the folder is an index into the records, not a copy of them.
    const dayOf = (at) => (at instanceof Date ? at.toLocaleDateString("en-CA", { timeZone: F.TZ }) : String(at).slice(0, 10));
    const timeline = [
      ...visits.rows.map((v) => ({ at: dayOf(v.at), kind: "Consultation", who: v, what: v.diagnosis || "Consultation recorded", href: `/patients/${v.patient_id}` })),
      ...doses.rows.map((d) => ({ at: dayOf(d.at), kind: "Immunization", who: d, what: `${d.vaccine_name} — dose ${d.dose_number}`, href: `/patients/${d.patient_id}/immunization` })),
      ...dispenses.rows.map((d) => ({ at: dayOf(d.at), kind: "Medicine", who: d, what: `${d.medicine}${d.dosage ? " " + d.dosage : ""} × ${d.quantity}${d.unit ? " " + d.unit : ""}`, href: `/patients/${d.patient_id}` })),
      ...prenatal.rows.map((r) => ({ at: dayOf(r.at), kind: "Prenatal", who: r, what: `Prenatal record (${r.status})`, href: `/patients/${r.patient_id}/prenatal/${r.prenatal_id}` })),
    ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 40);

    res.render("families/view", {
      title: `Family ${number} · Sampaguita HC`,
      active: "patients",
      number,
      members,
      upcoming: upcoming.rows,
      timeline,
      overdue,
      longDate: F.longDate,
      pretty: F.prettyService,
      shortTime: F.shortTime,
      today,
      others: others.rows,
      flash: req.query.flash || null,
    });
  } catch (e) {
    next(e);
  }
});

// ---- EDITING THE FAMILY FROM ITS OWN PAGE ------------------------------------
// "Inside /families/26-0005, is the record editable? Alyanna wants to edit it
// even from the grouped view" (Sept 29). The records themselves stay on each
// member's own page (one place to edit a thing, or two versions of it appear);
// every member now has an Edit button that goes straight there. What belongs
// to the FAMILY — who is in it — is edited here: add a patient, take one out.
// Both are the same writes the patient form makes, and both are audit-logged.

// POST /families/:number/members  — add a patient (moved in if they belong to another family)
router.post("/families/:number/members", async (req, res, next) => {
  try {
    const number = String(req.params.number || "");
    if (!FAMILY_RE.test(number)) return next();
    const back = (msg) => res.redirect(`/families/${number}?flash=${encodeURIComponent(msg)}`);
    const exists = await db.query("SELECT 1 FROM patients WHERE family_number=$1 LIMIT 1", [number]);
    if (!exists.rowCount) return next();
    const id = parseInt(req.body.patient_id, 10) || 0;
    const { rows } = await db.query(
      "SELECT patient_id, full_name, family_number FROM patients WHERE patient_id=$1", [id]);
    const p = rows[0];
    if (!p) return back("Pick a patient from the list first.");
    if (p.family_number === number) return back(`${p.full_name} is already in this family.`);
    await db.query("UPDATE patients SET family_number=$1, updated_at=now() WHERE patient_id=$2", [number, p.patient_id]);
    audit.log(req.session.user.user_id, "update", "patient", p.patient_id,
      p.family_number ? `moved from household ${p.family_number} to ${number} (family page)` : `added to household ${number} (family page)`);
    back(p.family_number ? `Moved ${p.full_name} from ${p.family_number} into this family.` : `Added ${p.full_name} to this family.`);
  } catch (e) {
    next(e);
  }
});

// POST /families/:number/members/:id/remove  — take one member out
router.post("/families/:number/members/:id/remove", async (req, res, next) => {
  try {
    const number = String(req.params.number || "");
    if (!FAMILY_RE.test(number)) return next();
    const { rows } = await db.query(
      `UPDATE patients SET family_number = NULL, updated_at = now()
        WHERE patient_id = $1 AND family_number = $2
        RETURNING patient_id, full_name`,
      [parseInt(req.params.id, 10) || 0, number]
    );
    if (!rows[0]) return next();
    audit.log(req.session.user.user_id, "update", "patient", rows[0].patient_id, `taken out of household ${number} (family page)`);
    const left = await db.query("SELECT count(*)::int n FROM patients WHERE family_number=$1", [number]);
    const msg = encodeURIComponent(`Took ${rows[0].full_name} out of family ${number}.`);
    // The last member out: the family no longer exists, so its page would 404.
    res.redirect(left.rows[0].n ? `/families/${number}?flash=${msg}` : `/families?flash=${msg}`);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
