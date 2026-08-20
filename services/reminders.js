// ============================================================================
// services/reminders.js — appointment reminder engine (M4 + M4.5 email)
// Finds scheduled appointments for a target date and reminds the patient on the
// channels that actually apply to them. Two things decide that: the patient's
// own preference (patients.reminder_channel) and whether they have a usable
// address on that channel at all.
//
// Every real ATTEMPT is logged in the notifications table (audit trail —
// RA 10173 + panel requirement). A channel that was never attempted is not
// logged: an elderly patient with no email address has not "failed" to be
// reminded, and filling the log with red rows for her only hid the failures
// that mattered.
//
// CLI:  node services/reminders.js [YYYY-MM-DD]   (force run, for testing)
// ============================================================================
const db = require("../db");
const F = require("../lib/format");
const sms = require("./sms");
const email = require("./email");

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CHANNELS = ["both", "email", "sms", "none"];
const CHANNEL_LABELS = {
  both: "Email at SMS",
  email: "Email lang",
  sms: "SMS lang",
  none: "Huwag magpadala",
};

function leadDays() {
  const n = Number(process.env.REMINDER_LEAD_DAYS);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

// Does this patient get reminded on this channel, on this run?
// `only` is the per-run override from the Reminders page ("email"/"sms"/null).
function wantsChannel(patient, channel, only) {
  if (only && only !== channel) return false;
  const pref = CHANNELS.includes(patient.reminder_channel) ? patient.reminder_channel : "both";
  if (pref === "none") return false;
  return pref === "both" || pref === channel;
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

// Send the instant confirmation for one appointment.
//
// Returns a result the booking screen can show the person at the desk, because
// the thing worth knowing is knowable immediately: whether this patient can be
// reached by email at all. Staff booked appointments for three weeks believing
// a confirmation went out; not one of them did.
//   { status: 'sent'|'failed'|'skipped', to, reason }
async function sendBookingConfirmation(appointment_id, kind = "booked") {
  const { rows } = await db.query(
    `SELECT a.appointment_id, a.appointment_date, a.appointment_time,
            s.name AS service_name,
            p.patient_id, p.full_name, p.email, p.family_email, p.reminder_channel
       FROM appointments a
       JOIN services s ON s.service_id = a.service_id
       JOIN patients p ON p.patient_id = a.patient_id
      WHERE a.appointment_id = $1`,
    [appointment_id]
  );
  const appt = rows[0];
  if (!appt) return { status: "skipped", to: null, reason: "Appointment not found." };

  if (!wantsChannel(appt, "email", null)) {
    return { status: "skipped", to: null, reason: "Naka-set ang pasyenteng ito na huwag paalalahanan sa email." };
  }

  const to = resolveEmailRecipient(appt);
  if (!to) {
    return { status: "skipped", to: null, reason: "Walang email address ang pasyenteng ito sa record." };
  }

  const mail = buildConfirmation(appt, kind);
  const r = await email.sendMail({ to: to.address, ...mail });
  await logNotification({
    patient_id: appt.patient_id, appointment_id: appt.appointment_id,
    channel: "email", recipient: to.address, recipient_type: to.type,
    message: `${mail.subject} — ${mail.text}`,
    status: r.sent ? "sent" : "failed",
    provider_message_id: null, provider_response: r.response,
  });
  return {
    status: r.sent ? "sent" : "failed",
    to: to.address,
    reason: r.sent ? (r.simulated ? "Simulated — walang tunay na email na lumabas." : null) : r.response,
  };
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

// Process reminders for one date.
//   opts.date   — 'YYYY-MM-DD' (defaults to today + REMINDER_LEAD_DAYS)
//   opts.force  — resend even if a 'sent' reminder already exists
//   opts.only   — 'email' | 'sms' to restrict this run to one channel
// Returns { date, only, total, sent, failed, skipped, simulated,
//           email:{sent,failed,skipped}, sms:{sent,failed,skipped,simulated} }.
async function processReminders({ date, force = false, only = null } = {}) {
  const target = isDate(date) ? date : F.addDays(F.manilaToday(), leadDays());
  const restrict = only === "email" || only === "sms" ? only : null;

  const { rows } = await db.query(
    `SELECT a.appointment_id, a.appointment_date, a.appointment_time,
            s.name AS service_name,
            p.patient_id, p.full_name, p.contact_number, p.family_contact_number,
            p.email, p.family_email, p.reminder_channel
       FROM appointments a
       JOIN services s ON s.service_id = a.service_id
       JOIN patients p ON p.patient_id = a.patient_id
      WHERE a.appointment_date = $1 AND a.status = 'scheduled'
      ORDER BY a.service_id, p.full_name`,
    [target]
  );

  const summary = {
    date: target, only: restrict, total: rows.length,
    sent: 0, failed: 0, skipped: 0, simulated: 0,
    email: { sent: 0, failed: 0, skipped: 0 },
    sms: { sent: 0, failed: 0, skipped: 0, simulated: 0 },
  };
  const bump = (ch, key) => { summary[ch][key]++; summary[key]++; };

  for (const appt of rows) {
    const message = buildMessage(appt);

    // ---- EMAIL channel ------------------------------------------------------
    const emailTo = wantsChannel(appt, "email", restrict) ? resolveEmailRecipient(appt) : null;
    if (!emailTo) {
      bump("email", "skipped");
    } else if (!force && (await alreadySent(appt.appointment_id, "email"))) {
      bump("email", "skipped");
    } else {
      const mail = buildEmail(appt);
      const r = await email.sendMail({ to: emailTo.address, ...mail });
      await logNotification({
        patient_id: appt.patient_id, appointment_id: appt.appointment_id,
        channel: "email", recipient: emailTo.address, recipient_type: emailTo.type,
        message: `${mail.subject} — ${mail.text}`,
        status: r.sent ? "sent" : "failed",
        provider_message_id: null, provider_response: r.response,
      });
      bump("email", r.sent ? "sent" : "failed");
    }

    // ---- SMS channel (no provider connected — see services/sms.js) ----------
    const smsTo = wantsChannel(appt, "sms", restrict) ? resolveRecipient(appt) : null;
    if (!smsTo) {
      bump("sms", "skipped");
    } else if (!force && (await alreadySent(appt.appointment_id, "sms"))) {
      bump("sms", "skipped");
    } else {
      const result = await sms.sendSMS(smsTo.number, message);
      if (result.simulated) { summary.sms.simulated++; summary.simulated++; }
      await logNotification({
        patient_id: appt.patient_id, appointment_id: appt.appointment_id,
        channel: "sms", recipient: smsTo.number, recipient_type: smsTo.type,
        message, status: result.status === "sent" ? "sent" : "failed",
        provider_message_id: result.message_id, provider_response: result.response,
      });
      bump("sms", result.status === "sent" ? "sent" : "failed");
    }
  }

  return summary;
}

module.exports = {
  CHANNELS, CHANNEL_LABELS, wantsChannel,
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
