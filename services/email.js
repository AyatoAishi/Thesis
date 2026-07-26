// ============================================================================
// services/email.js — Nodemailer SMTP client (M4 infrastructure)
// Simulation-first: without SMTP_USER/SMTP_PASS it logs instead of sending, so
// nothing breaks before the clinic configures email (Brevo / Gmail app pwd).
// Ready to power patient-portal emails and staff summaries in later milestones.
// ============================================================================
const nodemailer = require("nodemailer");

function isLive() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transport = null;
function getTransport() {
  if (transport) return transport;
  if (!isLive()) return null;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transport;
}

// Send an email. Always resolves with { sent, simulated, response }.
async function sendMail({ to, subject, text, html }) {
  if (!to) return { sent: false, simulated: !isLive(), response: "No recipient." };
  const from = process.env.MAIL_FROM || "Sampaguita Health Clinic <noreply@example.com>";

  if (!isLive()) {
    return { sent: true, simulated: true, response: "SIMULATED — no SMTP credentials; email not actually sent." };
  }
  try {
    const info = await getTransport().sendMail({ from, to, subject, text, html });
    return { sent: true, simulated: false, response: info.messageId || "ok" };
  } catch (e) {
    return { sent: false, simulated: false, response: `Email error: ${e.message}` };
  }
}

module.exports = { isLive, sendMail };
