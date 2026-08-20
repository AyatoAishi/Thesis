// ============================================================================
// routes/reminders.js — reminders admin UI (M4). Admin-only.
// Shows the delivery log + current mode (LIVE/SIMULATION), and lets staff send
// or re-send reminders for a chosen date. The unattended daily trigger lives in
// server.js (node-cron) + a token-guarded /tasks endpoint for cron-job.org.
// ============================================================================
const express = require("express");
const db = require("../db");
const F = require("../lib/format");
const sms = require("../services/sms");
const emailSvc = require("../services/email");
const { processReminders } = require("../services/reminders");
const { requireRole } = require("../middleware/auth");

const router = express.Router();
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

function defaultTarget() {
  const n = Number(process.env.REMINDER_LEAD_DAYS);
  return F.addDays(F.manilaToday(), Number.isFinite(n) && n >= 0 ? n : 1);
}

// How many reminders failed to leave the building lately. This is the number
// that should have been on a screen from the start: every one of these was a
// patient who was never told about their appointment.
async function recentFailures() {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n, max(created_at) AS latest
       FROM notifications
      WHERE channel='email' AND status='failed'
        AND created_at > now() - interval '30 days'`
  );
  return rows[0];
}

// Everything the page needs. Shared by the plain view and by the actions that
// finish by redrawing it (a self-test result is too long for a query string).
async function renderIndex(req, res, extra = {}) {
  const date = isDate(req.query.date) ? req.query.date : defaultTarget();

  const [logQ, cntQ, balance, fails] = await Promise.all([
    db.query(
      `SELECT n.notification_id, n.created_at, n.channel, n.recipient, n.recipient_type,
              n.status, n.message, n.patient_id, p.full_name
         FROM notifications n
         JOIN patients p ON p.patient_id = n.patient_id
        ORDER BY n.created_at DESC LIMIT 100`
    ),
    db.query(
      "SELECT count(*)::int n FROM appointments WHERE appointment_date=$1 AND status='scheduled'",
      [date]
    ),
    sms.accountBalance(),
    recentFailures(),
  ]);

  res.render("reminders/index", {
    title: "Reminders · Sampaguita HC",
    active: "reminders",
    live: sms.isLive(),
    smsProvider: sms.providerName(),
    emailLive: emailSvc.isLive(),
    emailInfo: emailSvc.describe(),
    emailTest: null,
    failures: fails,
    balance,
    date,
    pending: cntQ.rows[0].n,
    log: logQ.rows,
    cronExpr: process.env.REMINDER_CRON || "0 8 * * *",
    flash: req.query.flash || null,
    ...extra,
  });
}

// ---- GET /reminders  (admin) ----------------------------------------------
router.get("/reminders", requireRole("admin"), async (req, res, next) => {
  try {
    await renderIndex(req, res);
  } catch (e) {
    next(e);
  }
});

// ---- POST /reminders/test-email  (admin) -----------------------------------
// Opens a real connection to the mail provider and sends nothing. Safe to press
// as often as you like, and it is the only way to tell from inside the clinic
// whether email is actually working — the delivery log only shows the damage
// after the fact.
router.post("/reminders/test-email", requireRole("admin"), async (req, res, next) => {
  try {
    await renderIndex(req, res, { emailTest: await emailSvc.selfTest() });
  } catch (e) {
    next(e);
  }
});

// ---- POST /reminders/run-now  (admin) -------------------------------------
router.post("/reminders/run-now", requireRole("admin"), async (req, res, next) => {
  try {
    const date = isDate(req.body.date) ? req.body.date : undefined;
    const force = req.body.force === "on";
    const only = ["email", "sms"].includes(req.body.only) ? req.body.only : null;
    const s = await processReminders({ date, force, only });
    const part = (label, x) =>
      `${label}: ${x.sent} sent, ${x.failed} failed, ${x.skipped} skipped`;
    const flash =
      `Ran reminders for ${s.date} (${s.total} appointment${s.total === 1 ? "" : "s"}) — ` +
      part("Email", s.email) + " · " + part("SMS", s.sms) +
      (s.sms.simulated ? ` (${s.sms.simulated} simulated)` : "") + ".";
    res.redirect(`/reminders?date=${s.date}&flash=${encodeURIComponent(flash)}`);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
