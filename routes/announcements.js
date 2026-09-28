// ============================================================================
// routes/announcements.js — the clinic's notice board for patients.
//
// "Panel for special announcement na ibababa ng clinic kagaya ng mga libreng
// x-ray, medical, bakuna (para sa tigdas), vitamins … since wala naman sariling
// fb ang center nila." — Richelle, Sept 26.
//
// Admin and nurse post and edit; they are the ones who run those events.
// Every staff member can open the list (it is what patients are being told,
// and the desk gets asked about it), but only the two roles see the controls.
// Patients read them on the portal and on the public About page.
//
// The gate is on each route, not a bare router.use(): a root-mounted
// router.use(requireRole(...)) runs on EVERY request that passes through this
// router, and once 403'd every non-admin out of immunization and prenatal.
// ============================================================================
const express = require("express");
const db = require("../db");
const F = require("../lib/format");
const audit = require("../lib/audit");
const cal = require("../lib/calendar");
const { requireRole } = require("../middleware/auth");
const { TITLE_MAX, BODY_MAX } = require("../lib/announcements");

const router = express.Router();
const POSTERS = ["admin", "nurse"];
const canPost = (req) => POSTERS.includes(req.session.user && req.session.user.role);

function readForm(body) {
  return {
    title: String(body.title || "").trim(),
    body: String(body.body || "").replace(/\r\n/g, "\n").trim(),
    starts_on: String(body.starts_on || "").trim(),
    ends_on: String(body.ends_on || "").trim(),
  };
}

function validate(a) {
  const errors = [];
  if (!a.title) errors.push("Give it a title.");
  else if (a.title.length > TITLE_MAX) errors.push(`The title is too long (${a.title.length}/${TITLE_MAX}).`);
  if (!a.body) errors.push("Write what the announcement says.");
  else if (a.body.length > BODY_MAX) errors.push(`The text is too long (${a.body.length}/${BODY_MAX}).`);
  if (!cal.validDate(a.starts_on)) errors.push("Pick the day it starts showing.");
  if (a.ends_on && !cal.validDate(a.ends_on)) errors.push("The last day is not a real date.");
  if (cal.validDate(a.starts_on) && cal.validDate(a.ends_on) && a.ends_on < a.starts_on) {
    errors.push("The last day is before the first day.");
  }
  return errors;
}

// Where an announcement stands today, in words the list can show.
function stateOf(a, today) {
  if (a.starts_on > today) return { key: "upcoming", label: `Starts ${F.longDate(a.starts_on)}` };
  if (a.ends_on && a.ends_on < today) return { key: "ended", label: "Ended" };
  return { key: "live", label: "Showing to patients" };
}

async function list() {
  const { rows } = await db.query(
    `SELECT a.announcement_id, a.title, a.body,
            to_char(a.starts_on, 'YYYY-MM-DD') AS starts_on,
            to_char(a.ends_on, 'YYYY-MM-DD') AS ends_on,
            u.full_name AS posted_by
       FROM announcements a LEFT JOIN users u ON u.user_id = a.created_by
      ORDER BY (a.ends_on IS NOT NULL AND a.ends_on < $1), a.starts_on DESC, a.announcement_id DESC`,
    [F.manilaToday()]
  );
  return rows;
}

function renderIndex(res, req, { form, errors = [], editing = null, flash = null, rows }) {
  const today = F.manilaToday();
  res.status(errors.length ? 422 : 200).render("announcements/index", {
    title: "Announcements · Sampaguita HC",
    active: "announcements",
    rows: rows.map((r) => Object.assign(r, { state: stateOf(r, today) })),
    canPost: canPost(req),
    form, errors, editing, flash, today,
    action: editing ? `/announcements/${editing}` : "/announcements",
    TITLE_MAX, BODY_MAX, longDate: F.longDate,
  });
}

// ---- LIST + NEW FORM  GET /announcements -------------------------------------
router.get("/announcements", async (req, res, next) => {
  try {
    renderIndex(res, req, {
      rows: await list(),
      form: { title: "", body: "", starts_on: F.manilaToday(), ends_on: "" },
      flash: req.query.flash || null,
    });
  } catch (e) { next(e); }
});

// ---- CREATE  POST /announcements ---------------------------------------------
router.post("/announcements", requireRole(...POSTERS), async (req, res, next) => {
  try {
    const a = readForm(req.body);
    const errors = validate(a);
    if (errors.length) return renderIndex(res, req, { rows: await list(), form: a, errors });
    const { rows } = await db.query(
      `INSERT INTO announcements (title, body, starts_on, ends_on, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING announcement_id`,
      [a.title, a.body, a.starts_on, a.ends_on || null, req.session.user.user_id]
    );
    audit.log(req.session.user.user_id, "create", "announcement", rows[0].announcement_id, a.title);
    res.redirect("/announcements?flash=" + encodeURIComponent("Posted. Patients see it from " + F.longDate(a.starts_on) + "."));
  } catch (e) { next(e); }
});

// ---- EDIT FORM  GET /announcements/:id/edit ----------------------------------
router.get("/announcements/:id/edit", requireRole(...POSTERS), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10) || 0;
    const rows = await list();
    const a = rows.find((r) => r.announcement_id === id);
    if (!a) return next();
    renderIndex(res, req, { rows, editing: id, form: { title: a.title, body: a.body, starts_on: a.starts_on, ends_on: a.ends_on || "" } });
  } catch (e) { next(e); }
});

// ---- UPDATE  POST /announcements/:id -----------------------------------------
router.post("/announcements/:id", requireRole(...POSTERS), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10) || 0;
    const a = readForm(req.body);
    const errors = validate(a);
    if (errors.length) return renderIndex(res, req, { rows: await list(), form: a, errors, editing: id });
    const { rowCount } = await db.query(
      `UPDATE announcements SET title=$1, body=$2, starts_on=$3, ends_on=$4, updated_at=now()
        WHERE announcement_id=$5`,
      [a.title, a.body, a.starts_on, a.ends_on || null, id]
    );
    if (!rowCount) return next();
    audit.log(req.session.user.user_id, "update", "announcement", id, a.title);
    res.redirect("/announcements?flash=" + encodeURIComponent("Saved."));
  } catch (e) { next(e); }
});

// ---- REMOVE  POST /announcements/:id/delete ----------------------------------
// A real delete. The activity log keeps what it said and when it ran, which is
// the record that matters; an "ended" flag would only be one more state for
// the portal query to get wrong. To stop one early but keep it listed, edit
// its last day instead.
router.post("/announcements/:id/delete", requireRole(...POSTERS), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10) || 0;
    const { rows } = await db.query(
      `DELETE FROM announcements WHERE announcement_id=$1
       RETURNING title, to_char(starts_on,'YYYY-MM-DD') AS s, to_char(ends_on,'YYYY-MM-DD') AS e`,
      [id]
    );
    if (!rows.length) return next();
    const r = rows[0];
    audit.log(req.session.user.user_id, "delete", "announcement", id, `${r.title} (${r.s} to ${r.e || "open-ended"})`);
    res.redirect("/announcements?flash=" + encodeURIComponent("Removed. Patients no longer see it."));
  } catch (e) { next(e); }
});

module.exports = router;
