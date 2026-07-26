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

// ---- GET /reminders  (admin) ----------------------------------------------
router.get("/reminders", requireRole("admin"), async (req, res, next) => {
  try {
    const date = isDate(req.query.date) ? req.query.date : defaultTarget();

    const [logQ, cntQ, balance] = await Promise.all([
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
    ]);

    res.render("reminders/index", {
      title: "Reminders · Sampaguita HC",
      active: "reminders",
      live: sms.isLive(),
      emailLive: emailSvc.isLive(),
      balance,
      date,
      pending: cntQ.rows[0].n,
      log: logQ.rows,
      cronExpr: process.env.REMINDER_CRON || "0 8 * * *",
      flash: req.query.flash || null,
    });
  } catch (e) {
    next(e);
  }
});

// ---- POST /reminders/run-now  (admin) -------------------------------------
router.post("/reminders/run-now", requireRole("admin"), async (req, res, next) => {
  try {
    const date = isDate(req.body.date) ? req.body.date : undefined;
    const force = req.body.force === "on";
    const s = await processReminders({ date, force });
    const flash =
      `Ran reminders for ${s.date} (${s.total} appointment${s.total === 1 ? "" : "s"}) — ` +
      `Email: ${s.email.sent} sent, ${s.email.failed} failed, ${s.email.skipped} skipped · ` +
      `SMS: ${s.sms.sent} sent, ${s.sms.failed} failed, ${s.sms.skipped} skipped` +
      (s.sms.simulated ? ` (${s.sms.simulated} simulated)` : "") + ".";
    res.redirect(`/reminders?date=${s.date}&flash=${encodeURIComponent(flash)}`);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
