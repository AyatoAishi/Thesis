// ============================================================================
// services/reminders.js — appointment reminder engine (M4 + M4.5 email)
// Finds scheduled appointments for a target date and reminds the patient on
// EVERY channel they have: email (LIVE via Gmail SMTP) and SMS (simulation
// until an affordable provider replaces Semaphore). Falls back to the family
// contact per channel. EVERY attempt is logged in the notifications table
// (audit trail — RA 10173 + panel requirement).
//
// CLI:  node services/reminders.js [YYYY-MM-DD]   (force run, for testing)
// ============================================================================
const db = require("../db");
const F = require("../lib/format");
const sms = require("./sms");
const email = require("./email");

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function leadDays() {
  const n = Number(process.env.REMINDER_LEAD_DAYS);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

// Build the SMS reminder text. Must NOT start with "TEST". Kept short (~1 credit).
function buildMessage({ full_name, service_name, appointment_date, appointment_time }) {
  const svc = F.prettyService(service_name);
  const when = F.longDate(appointment_date);
  const time = F.shortTime(appointment_time);
  const timePart = time ? ` ${time}` : "";
  return `Sampaguita Health Clinic: Paalala po. Si ${full_name} ay may ${svc} appointment sa ${when}${timePart}. Salamat po.`;
}

// Build the email version (subject + text + simple HTML).
function buildEmail(appt) {
  const svc = F.prettyService(appt.service_name);
  const when = F.longDate(appt.appointment_date);
  const time = F.shortTime(appt.appointment_time);
  const timePart = time ? ` ${time}` : "";
  const text = buildMessage(appt);
  return {
    subject: `Paalala: ${svc} appointment — ${when}`,
    text,
    html:
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">` +
      `<p>Magandang araw po!</p>` +
      `<p>Paalala po: si <b>${appt.full_name}</b> ay may <b>${svc}</b> appointment sa ` +
      `<b>${when}${timePart}</b> sa Barangay Sampaguita Health Clinic.</p>` +
      `<p>Salamat po.<br/>— Sampaguita Health Clinic</p>` +
      `<p style="font-size:11px;color:#888">Automated reminder. Huwag pong i-reply ang email na ito.</p>` +
      `</div>`,
  };
}

// Build the instant booking-confirmation email (sent the moment staff books).
function buildConfirmation(appt, kind = "booked") {
  const svc = F.prettyService(appt.service_name);
  const when = F.longDate(appt.appointment_date);
  const time = F.shortTime(appt.appointment_time);
  const timePart = time ? `, ${time}` : "";
  const verb = kind === "rescheduled" ? "nailipat" : "naitakda";
  const subject = kind === "rescheduled"
    ? `Nailipat ang appointment — ${when}${timePart}`
    : `Kumpirmado: ${svc} appointment — ${when}${timePart}`;
  const text =
    `Sampaguita Health Clinic: Ang ${svc} appointment ni ${appt.full_name} ay ` +
    `${verb} sa ${when}${timePart}. May ipapadala pa pong paalala bago ang appointment. Salamat po.`;
  return {
    subject,
    text,
    html:
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">` +
      `<p>Magandang araw po!</p>` +
      `<p>Ang <b>${svc}</b> appointment ni <b>${appt.full_name}</b> ay ${verb} sa ` +
      `<b>${when}${timePart}</b> sa Barangay Sampaguita Health Clinic.</p>` +
      `<p>May ipapadala pa pong paalala isang araw bago ang appointment.</p>` +
      `<p>Salamat po.<br/>— Sampaguita Health Clinic</p>` +
      `<p style="font-size:11px;color:#888">Automated message. Huwag pong i-reply ang email na ito.</p>` +
      `</div>`,
  };
}

// Send the instant confirmation for one appointment (fire-and-forget from the
// booking route — a mail failure must never block the booking itself).
// Logged in notifications like everything else.
async function sendBookingConfirmation(appointment_id, kind = "booked") {
  const { rows } = await db.query(
    `SELECT a.appointment_id, a.appointment_date, a.appointment_time,
            s.name AS service_name,
            p.patient_id, p.full_name, p.email, p.family_email
       FROM appointments a
       JOIN services s ON s.service_id = a.service_id
       JOIN patients p ON p.patient_id = a.patient_id
      WHERE a.appointment_id = $1`,
    [appointment_id]
  );
  const appt = rows[0];
  if (!appt) return { sent: false, response: "Appointment not found." };

  const to = resolveEmailRecipient(appt);
  if (!to) return { sent: false, response: "No valid email for patient or family." };

  const mail = buildConfirmation(appt, kind);
  const r = await email.sendMail({ to: to.address, ...mail });
  await logNotification({
    patient_id: appt.patient_id, appointment_id: appt.appointment_id,
    channel: "email", recipient: to.address, recipient_type: to.type,
    message: `${mail.subject} — ${mail.text}`,
    status: r.sent ? "sent" : "failed",
    provider_message_id: null, provider_response: r.response,
  });
  return r;
}

// Resolve who to text: the patient first, then the family contact fallback.
function resolveRecipient(p) {
  const patientNo = sms.normalizePH(p.contact_number);
  if (patientNo) return { number: patientNo, type: "patient" };
  const familyNo = sms.normalizePH(p.family_contact_number);
  if (familyNo) return { number: familyNo, type: "family" };
  return null;
}

// Resolve who to email: the patient first, then the family email fallback.
function resolveEmailRecipient(p) {
  const pe = (p.email || "").trim().toLowerCase();
  if (EMAIL_RE.test(pe)) return { address: pe, type: "patient" };
  const fe = (p.family_email || "").trim().toLowerCase();
  if (EMAIL_RE.test(fe)) return { address: fe, type: "family" };
  return null;
}

async function logNotification(n) {
  await db.query(
    `INSERT INTO notifications
       (patient_id, appointment_id, channel, recipient, recipient_type, message,
        status, provider_message_id, provider_response, sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [n.patient_id, n.appointment_id, n.channel, n.recipient, n.recipient_type,
     n.message, n.status, n.provider_message_id, n.provider_response,
     n.status === "sent" ? new Date() : null]
  );
}

// Already sent a reminder for this appointment on this channel?
async function alreadySent(appointment_id, channel) {
  const dup = await db.query(
    `SELECT 1 FROM notifications
      WHERE appointment_id=$1 AND channel=$2 AND status='sent' LIMIT 1`,
    [appointment_id, channel]
  );
  return dup.rowCount > 0;
}

// Process reminders for one date (both channels per appointment).
//   opts.date   — 'YYYY-MM-DD' (defaults to today + REMINDER_LEAD_DAYS)
//   opts.force  — resend even if a 'sent' reminder already exists
// Returns { date, total, sent, failed, skipped, simulated,
//           email:{sent,failed,skipped}, sms:{sent,failed,skipped,simulated} }.
async function processReminders({ date, force = false } = {}) {
  const target = isDate(date) ? date : F.addDays(F.manilaToday(), leadDays());

  const { rows } = await db.query(
    `SELECT a.appointment_id, a.appointment_date, a.appointment_time,
            s.name AS service_name,
            p.patient_id, p.full_name, p.contact_number, p.family_contact_number,
            p.email, p.family_email
       FROM appointments a
       JOIN services s ON s.service_id = a.service_id
       JOIN patients p ON p.patient_id = a.patient_id
      WHERE a.appointment_date = $1 AND a.status = 'scheduled'
      ORDER BY a.service_id, p.full_name`,
    [target]
  );

  const summary = {
    date: target, total: rows.length,
    sent: 0, failed: 0, skipped: 0, simulated: 0,
    email: { sent: 0, failed: 0, skipped: 0 },
    sms: { sent: 0, failed: 0, skipped: 0, simulated: 0 },
  };
  const bump = (ch, key) => { summary[ch][key]++; summary[key]++; };

  for (const appt of rows) {
    const message = buildMessage(appt);

    // ---- EMAIL channel (live via Gmail SMTP) --------------------------------
    if (force || !(await alreadySent(appt.appointment_id, "email"))) {
      const to = resolveEmailRecipient(appt);
      if (!to) {
        await logNotification({
          patient_id: appt.patient_id, appointment_id: appt.appointment_id,
          channel: "email", recipient: "(none)", recipient_type: "patient",
          message, status: "failed", provider_message_id: null,
          provider_response: "No valid email for patient or family.",
        });
        bump("email", "failed");
      } else {
        const mail = buildEmail(appt);
        const r = await email.sendMail({ to: to.address, ...mail });
        await logNotification({
          patient_id: appt.patient_id, appointment_id: appt.appointment_id,
          channel: "email", recipient: to.address, recipient_type: to.type,
          message: `${mail.subject} — ${mail.text}`,
          status: r.sent ? "sent" : "failed",
          provider_message_id: null, provider_response: r.response,
        });
        bump("email", r.sent ? "sent" : "failed");
      }
    } else {
      bump("email", "skipped");
    }

    // ---- SMS channel (simulation until a provider is configured) ------------
    if (force || !(await alreadySent(appt.appointment_id, "sms"))) {
      const recipient = resolveRecipient(appt);
      if (!recipient) {
        await logNotification({
          patient_id: appt.patient_id, appointment_id: appt.appointment_id,
          channel: "sms", recipient: "(none)", recipient_type: "patient",
          message, status: "failed", provider_message_id: null,
          provider_response: "No valid contact number for patient or family.",
        });
        bump("sms", "failed");
      } else {
        const result = await sms.sendSMS(recipient.number, message);
        if (result.simulated) { summary.sms.simulated++; summary.simulated++; }
        await logNotification({
          patient_id: appt.patient_id, appointment_id: appt.appointment_id,
          channel: "sms", recipient: recipient.number, recipient_type: recipient.type,
          message, status: result.status === "sent" ? "sent" : "failed",
          provider_message_id: result.message_id, provider_response: result.response,
        });
        bump("sms", result.status === "sent" ? "sent" : "failed");
      }
    } else {
      bump("sms", "skipped");
    }
  }

  return summary;
}

module.exports = {
  buildMessage, buildEmail, buildConfirmation, resolveRecipient,
  resolveEmailRecipient, sendBookingConfirmation, processReminders, leadDays,
};

// ---- CLI test harness ------------------------------------------------------
if (require.main === module) {
  require("dotenv").config();
  processReminders({ date: process.argv[2], force: true })
    .then((s) => { console.log("Reminder run:", JSON.stringify(s, null, 2)); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
