// ============================================================================
// services/email.js — outbound email, two ways out (M4 infrastructure)
//
// There are two ways an email can leave this app, and which one is used depends
// only on what is in the environment:
//
//   1. BREVO_API_KEY set  -> Brevo's HTTP API over port 443.
//   2. SMTP_USER + SMTP_PASS set -> ordinary SMTP (Gmail by default).
//   3. neither            -> simulation; nothing leaves, everything is logged.
//
// The HTTP path exists because of something learned the hard way: Render's free
// tier blocks outbound SMTP. Between 2026-07-26 and 2026-08-19, every single
// reminder sent from production failed with "Connection timeout" — 26 in a row
// — while the exact same credentials worked from a laptop. Nothing was wrong
// with the mail account; the packets never left the host. Port 443 is not
// blocked anywhere, so an HTTP API gets out where SMTP cannot.
//
// SMTP is kept because it works locally and needs no third-party signup, which
// makes development and marking easier.
//
// Every function here resolves — mail trouble must never take a page down.
// Credentials are read ONLY from the environment, never hardcoded.
// ============================================================================
const nodemailer = require("nodemailer");

const BREVO_SEND = "https://api.brevo.com/v3/smtp/email";
const BREVO_ACCOUNT = "https://api.brevo.com/v3/account";

// Fail fast. Nodemailer's default connection timeout is two minutes, so on a
// host that blocks SMTP a single booking left a promise hanging that long, and
// a reminder run for twenty patients took the best part of an hour to finish
// failing. Ten seconds is plenty for a socket that is going to open at all.
const TIMEOUT_MS = 10000;

function mode() {
  if (process.env.BREVO_API_KEY) return "api";
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp";
  return "simulation";
}

function isLive() {
  return mode() !== "simulation";
}

// "Sampaguita Health Clinic <clinic@example.com>" -> { name, email }
function parseFrom() {
  const raw = process.env.MAIL_FROM || "Sampaguita Health Clinic <noreply@example.com>";
  const m = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m
    ? { name: m[1].replace(/^"|"$/g, "") || "Sampaguita Health Clinic", email: m[2].trim() }
    : { name: "Sampaguita Health Clinic", email: raw.trim() };
}

// What this server is configured to do, in a shape that is safe to put on a
// screen: whether each secret is present, never what it contains.
function describe() {
  const from = parseFrom();
  return {
    mode: mode(),
    from_name: from.name,
    from_email: from.email,
    smtp_host: process.env.SMTP_HOST || "smtp.gmail.com",
    smtp_port: Number(process.env.SMTP_PORT || 587),
    smtp_user_set: Boolean(process.env.SMTP_USER),
    smtp_pass_set: Boolean(process.env.SMTP_PASS),
    api_key_set: Boolean(process.env.BREVO_API_KEY),
  };
}

// Turn a raw network/provider error into something a clinic staff member can
// act on. The distinction that matters most: a timeout means the message never
// reached the mail provider at all, which is a hosting problem, not a wrong
// password.
function explain(err) {
  const code = (err && err.code) || "";
  const msg = (err && err.message) || String(err);
  if (code === "ETIMEDOUT" || code === "ESOCKET" || /timeout/i.test(msg)) {
    return "Could not reach the mail server — the connection timed out. This host is most likely blocking outgoing email.";
  }
  if (code === "EAUTH" || /invalid login|username and password/i.test(msg)) {
    return "The mail server refused the username or password.";
  }
  if (code === "EDNS" || /getaddrinfo|ENOTFOUND/i.test(msg)) {
    return "The mail server address could not be found — check the host name.";
  }
  return msg;
}

let transport = null;
function getTransport() {
  if (transport) return transport;
  const d = describe();
  transport = nodemailer.createTransport({
    host: d.smtp_host,
    port: d.smtp_port,
    secure: d.smtp_port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
  return transport;
}

// ---- Brevo HTTP send --------------------------------------------------------
async function sendViaApi({ to, subject, text, html }) {
  const from = parseFrom();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BREVO_SEND, {
      method: "POST",
      signal: ctl.signal,
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: from.name, email: from.email },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html || undefined,
      }),
    });
    const body = await res.text();
    if (res.ok) {
      let id = "ok";
      try { id = JSON.parse(body).messageId || "ok"; } catch { /* keep "ok" */ }
      return { sent: true, simulated: false, response: String(id).slice(0, 200) };
    }
    // Brevo answers with a JSON { code, message } that is worth keeping whole —
    // "sender not valid" is the usual one, and it names its own cure.
    return { sent: false, simulated: false, response: `Brevo ${res.status}: ${body.slice(0, 300)}` };
  } catch (e) {
    const why = e.name === "AbortError" ? "Request timed out." : explain(e);
    return { sent: false, simulated: false, response: `Email error: ${why}` };
  } finally {
    clearTimeout(timer);
  }
}

// ---- SMTP send --------------------------------------------------------------
async function sendViaSmtp({ to, subject, text, html }) {
  const from = process.env.MAIL_FROM || "Sampaguita Health Clinic <noreply@example.com>";
  try {
    const info = await getTransport().sendMail({ from, to, subject, text, html });
    return { sent: true, simulated: false, response: info.messageId || "ok" };
  } catch (e) {
    return { sent: false, simulated: false, response: `Email error: ${explain(e)}` };
  }
}

// Send an email. Always resolves with { sent, simulated, response }.
async function sendMail({ to, subject, text, html }) {
  if (!to) return { sent: false, simulated: !isLive(), response: "No recipient." };
  const how = mode();
  if (how === "simulation") {
    return { sent: true, simulated: true, response: "SIMULATED — no mail credentials; email not actually sent." };
  }
  return how === "api"
    ? sendViaApi({ to, subject, text, html })
    : sendViaSmtp({ to, subject, text, html });
}

// ---- Self-test --------------------------------------------------------------
// Answers one question honestly: can this server, right now, get an email out?
// It opens a real connection but sends nothing, so it is safe to press twice.
// This is what tells the difference between "nobody configured it" and "the
// host is blocking it" — a difference that cost this project three weeks of
// silently undelivered reminders before anyone looked.
async function selfTest() {
  const d = describe();
  const started = Date.now();
  const done = (ok, detail) => ({ ok, detail, ms: Date.now() - started, ...d });

  if (d.mode === "simulation") {
    return done(false, "No mail credentials are set on this server, so nothing is being sent. Reminders are only being written to the log.");
  }

  if (d.mode === "api") {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(BREVO_ACCOUNT, {
        signal: ctl.signal,
        headers: { "api-key": process.env.BREVO_API_KEY, accept: "application/json" },
      });
      if (res.ok) return done(true, "Connected to Brevo and the API key was accepted. Email can go out from this server.");
      if (res.status === 401) return done(false, "Brevo rejected the API key. Check the key in the Render dashboard.");
      return done(false, `Brevo answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } catch (e) {
      const why = e.name === "AbortError" ? "The request timed out." : explain(e);
      return done(false, why);
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    await getTransport().verify();
    return done(true, `Connected to ${d.smtp_host}:${d.smtp_port} and the sign-in was accepted. Email can go out from this server.`);
  } catch (e) {
    return done(false, explain(e));
  }
}

module.exports = { isLive, mode, describe, selfTest, sendMail, parseFrom };
