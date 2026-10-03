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
const audit = require("../lib/audit");
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

// A text is logged `pending` the moment the gateway accepts it, before the
// phone has sent anything. Nothing ever went back to ask, so a text that had
// long since arrived stayed "pending" in the log forever (Oct 2026 review).
// Each visit to this page asks the gateway about the recent pending ones and
// records what the phone reports. Bounded (last 3 days, 25 rows) so a page
// load never turns into a long chain of network calls.
async function refreshPendingSms() {
  if (sms.provider() !== "smsgate") return;
  const { rows } = await db.query(
    `SELECT notification_id, provider_message_id
       FROM notifications
      WHERE channel='sms' AND status='pending' AND provider_message_id IS NOT NULL
        AND created_at > now() - interval '3 days'
      ORDER BY created_at DESC LIMIT 25`
  );
  await Promise.all(rows.map(async (n) => {
    const st = await sms.messageState(n.provider_message_id);
    if (!st || !st.state) return;                       // gateway silent: leave it pending
    const done = ["Sent", "Delivered"].includes(st.state);
    if (!done && st.state !== "Failed") return;         // still Pending/Processed on the phone
    await db.query(
      `UPDATE notifications
          SET status=$2::varchar, sent_at = CASE WHEN $2::varchar = 'sent' THEN now() ELSE sent_at END,
              provider_response = $3
        WHERE notification_id=$1 AND status='pending'`,
      [n.notification_id, done ? "sent" : "failed",
       `The phone reports: ${st.state}${st.reason ? ` — ${st.reason}` : ""}.`]
    );
  }));
}

// Everything the page needs. Shared by the plain view and by the actions that
// finish by redrawing it (a self-test result is too long for a query string).
async function renderIndex(req, res, extra = {}) {
  const date = isDate(req.query.date) ? req.query.date : defaultTarget();

  // The log has its own date, separate from the send form's. The send form's
  // date is the APPOINTMENT date; this one is the day reminders were SENT.
  // The review found them tangled: picking a date showed every reminder ever
  // sent, which reads as the filter being broken. "Kapag nagchoose … ng date
  // sa recent reminders, kung ano ung sent reminders sa date na yon, ayun lang
  // din dapat ung lalabas." Blank means everything, newest first.
  const logDate = isDate(req.query.log_date) ? req.query.log_date : "";

  try {
    await refreshPendingSms();
  } catch (e) {
    console.error("[reminders] pending SMS refresh:", e.message);  // never block the page on it
  }

  const [logQ, cntQ, balance, fails] = await Promise.all([
    db.query(
      `SELECT n.notification_id, n.created_at, n.channel, n.recipient, n.recipient_type,
              n.status, n.message, n.patient_id, p.full_name,
              p.contact_number, p.email, p.family_contact_number, p.family_email
         FROM notifications n
         JOIN patients p ON p.patient_id = n.patient_id
        WHERE $1 = '' OR (n.created_at AT TIME ZONE 'Asia/Manila')::date = $1::date
        ORDER BY n.created_at DESC LIMIT 300`,
      [logDate]
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
    smsKind: sms.provider(),
    smsEncrypted: !!process.env.SMSGATE_PASSPHRASE,
    smsTest: null,
    emailLive: emailSvc.isLive(),
    emailInfo: emailSvc.describe(),
    emailTest: null,
    failures: fails,
    balance,
    date,
    pending: cntQ.rows[0].n,
    log: logQ.rows,
    logDate,
    logTotals: logQ.rows.reduce((t, n) => { t[n.status] = (t[n.status] || 0) + 1; return t; }, {}),
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

// ---- POST /reminders/test-sms  (admin) ------------------------------------
// One real text to a number the admin types, so "is SMS working?" can be
// answered from inside the clinic before it matters — the delivery log only
// shows the damage after the fact. Not tied to a patient, so it goes to the
// activity log rather than the notifications table.
router.post("/reminders/test-sms", requireRole("admin"), async (req, res, next) => {
  try {
    const to = sms.normalizePH(req.body.number);
    let smsTest;
    if (!sms.isLive()) {
      smsTest = { ok: false, number: req.body.number || "", response: "No SMS provider is switched on, so nothing can be sent." };
    } else if (!to) {
      smsTest = { ok: false, number: req.body.number || "", response: "That is not an 11-digit mobile number (09xxxxxxxxx)." };
    } else {
      const r = await sms.sendSMS(to,
        "Sampaguita Health Clinic: pagsubok lamang ito ng reminder system. Wala pong kailangang gawin. Salamat po.");
      smsTest = { ok: r.status === "sent", status: r.status, number: to, id: r.message_id, response: r.response };
      audit.log(req.session.user.user_id, "test", "sms", null,
        `test SMS to ${to}: ${r.status}${r.message_id ? ` (${r.message_id})` : ""}`);
    }
    await renderIndex(req, res, { smsTest });
  } catch (e) {
    next(e);
  }
});

// ---- POST /reminders/test-sms/check  (admin) ------------------------------
// Where that test text stands now: the phone reports Sent, then Delivered once
// the recipient's network confirms it.
router.post("/reminders/test-sms/check", requireRole("admin"), async (req, res, next) => {
  try {
    const id = String(req.body.id || "").slice(0, 64);
    const st = await sms.messageState(id);
    const smsTest = {
      ok: !!(st && ["Sent", "Delivered", "Processed"].includes(st.state)),
      status: st ? String(st.state || "unknown").toLowerCase() : "unknown",
      number: String(req.body.number || "").slice(0, 16), id,
      response: st ? `The phone reports: ${st.state || "no state yet"}${st.reason ? ` — ${st.reason}` : ""}.` : "The gateway did not answer.",
    };
    await renderIndex(req, res, { smsTest });
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
      (s.sms.pending ? ` (${s.sms.pending} still waiting on the phone)` : "") +
      (s.sms.simulated ? ` (${s.sms.simulated} simulated)` : "") + ".";
    res.redirect(`/reminders?date=${s.date}&flash=${encodeURIComponent(flash)}`);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
