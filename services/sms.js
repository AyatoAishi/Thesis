// ============================================================================
// services/sms.js — SMS sending, provider-agnostic (M4)
//
// STATUS, 2026-08-20: no provider is connected. Not one real text message has
// ever left this system; every `channel='sms'` row in the notifications table
// is a dry run. This is deliberate, not an oversight — Semaphore was priced out
// (~₱0.50 per text, with a sender ID that takes days to approve) and PhilSMS is
// still being looked at. The socket is wired and the plug is not in yet.
//
// To go live, set ONE of these and restart. Nothing else changes:
//
//   PHILSMS_TOKEN   + PHILSMS_SENDER      -> PhilSMS  (app.philsms.com, v3)
//   SEMAPHORE_API_KEY + SEMAPHORE_SENDER  -> Semaphore (api.semaphore.co, v4)
//
// The two providers disagree about almost everything — number format, auth
// header, body encoding, what "success" looks like — so each gets its own
// adapter and the rest of the app sees neither. Keys are read ONLY from the
// environment.
//
// The PhilSMS adapter is written from its published API and has never been run
// against the live service; treat the first real send as a test.
// ============================================================================
const SEMAPHORE_BASE = "https://api.semaphore.co/api/v4";
const PHILSMS_BASE = "https://app.philsms.com/api/v3";
const TIMEOUT_MS = 15000;

// Which adapter is in play. PhilSMS wins if both are somehow set.
function provider() {
  if (process.env.PHILSMS_TOKEN) return "philsms";
  if (process.env.SEMAPHORE_API_KEY) return "semaphore";
  return null;
}

function providerName() {
  return { philsms: "PhilSMS", semaphore: "Semaphore" }[provider()] || null;
}

function isLive() {
  return provider() !== null;
}

// Normalize a PH mobile number to 11 digits, 09xxxxxxxxx.
// Returns null if it can't be made into a valid PH mobile number.
function normalizePH(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/[^\d+]/g, "");
  if (s.startsWith("+63")) s = "0" + s.slice(3);
  else if (s.startsWith("63") && s.length === 12) s = "0" + s.slice(2);
  else if (s.length === 10 && s.startsWith("9")) s = "0" + s; // 9xxxxxxxxx
  return /^09\d{9}$/.test(s) ? s : null;
}

// PhilSMS wants the international form without a plus: 639xxxxxxxxx.
function toIntl(local09) {
  return "63" + local09.slice(1);
}

// Guard: Semaphore SILENTLY DROPS any message whose body starts with "test".
// Never let such a message through — surface it as an error instead.
function assertSendable(message) {
  if (!message || !message.trim()) throw new Error("Empty SMS message.");
  if (/^\s*test\b/i.test(message)) {
    throw new Error('SMS body must not start with "TEST" — Semaphore drops these silently.');
  }
}

function withTimeout() {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  return { signal: ctl.signal, done: () => clearTimeout(timer) };
}

const failed = (response) => ({ sent: false, simulated: false, message_id: null, status: "failed", response });

// ---- PhilSMS ---------------------------------------------------------------
async function sendPhilSMS(local09, message) {
  const t = withTimeout();
  try {
    const res = await fetch(`${PHILSMS_BASE}/sms/send`, {
      method: "POST",
      signal: t.signal,
      headers: {
        Authorization: `Bearer ${process.env.PHILSMS_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        recipient: toIntl(local09),
        sender_id: process.env.PHILSMS_SENDER || "PhilSMS",
        type: "plain",
        message,
      }),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    if (res.ok && data && data.status === "success") {
      const id = data.data && (data.data.uid || data.data.message_id);
      return {
        sent: true, simulated: false,
        message_id: id ? String(id) : null,
        status: "sent",
        response: text.slice(0, 400),
      };
    }
    return failed(`PhilSMS ${res.status}: ${text.slice(0, 300)}`);
  } catch (e) {
    return failed(e.name === "AbortError" ? "PhilSMS request timed out." : `Network error: ${e.message}`);
  } finally {
    t.done();
  }
}

// ---- Semaphore -------------------------------------------------------------
async function sendSemaphore(local09, message, sender) {
  const body = new URLSearchParams({
    apikey: process.env.SEMAPHORE_API_KEY,
    number: local09,
    message,
  });
  const senderName = sender || process.env.SEMAPHORE_SENDER;
  if (senderName) body.set("sendername", senderName);

  const t = withTimeout();
  try {
    const res = await fetch(`${SEMAPHORE_BASE}/messages`, { method: "POST", body, signal: t.signal });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    const first = Array.isArray(data) ? data[0] : null;
    if (res.ok && first && first.message_id) {
      return {
        sent: true, simulated: false, message_id: String(first.message_id),
        status: first.status || "sent", response: JSON.stringify(first).slice(0, 500),
      };
    }
    return failed((typeof data === "string" ? data : JSON.stringify(data)).slice(0, 500));
  } catch (e) {
    return failed(e.name === "AbortError" ? "Semaphore request timed out." : `Network error: ${e.message}`);
  } finally {
    t.done();
  }
}

// Send one SMS. Always resolves (never throws on network/provider failure) with:
//   { sent, simulated, message_id, status: 'sent'|'failed', response }
async function sendSMS(number, message, { sender } = {}) {
  assertSendable(message);

  const to = normalizePH(number);
  if (!to) {
    return { sent: false, simulated: !isLive(), message_id: null, status: "failed", response: `Invalid PH number: ${number}` };
  }

  const p = provider();
  if (!p) {
    return {
      sent: true, simulated: true, message_id: null, status: "sent",
      response: "SIMULATED — no SMS provider connected; no text was actually sent.",
    };
  }
  return p === "philsms" ? sendPhilSMS(to, message) : sendSemaphore(to, message, sender);
}

// Remaining credit, if the provider will tell us. Returns a number, or null.
async function accountBalance() {
  const p = provider();
  if (!p) return null;
  const t = withTimeout();
  try {
    if (p === "philsms") {
      const res = await fetch(`${PHILSMS_BASE}/balance`, {
        signal: t.signal,
        headers: { Authorization: `Bearer ${process.env.PHILSMS_TOKEN}`, Accept: "application/json" },
      });
      const data = await res.json();
      const bal = data && (data.balance != null ? data.balance : data.data && data.data.balance);
      return bal != null ? Number(bal) : null;
    }
    const res = await fetch(
      `${SEMAPHORE_BASE}/account?apikey=${encodeURIComponent(process.env.SEMAPHORE_API_KEY)}`,
      { signal: t.signal }
    );
    const data = await res.json();
    const bal = data && (data.credit_balance != null ? data.credit_balance : data.account_balance);
    return bal != null ? Number(bal) : null;
  } catch {
    return null;
  } finally {
    t.done();
  }
}

module.exports = { isLive, provider, providerName, normalizePH, toIntl, assertSendable, sendSMS, accountBalance };
