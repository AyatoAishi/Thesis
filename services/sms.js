// ============================================================================
// services/sms.js — Semaphore SMS client (M4)
// Simulation-first: with no SEMAPHORE_API_KEY the module never touches the
// network — it returns a simulated "sent" result so the whole reminder
// pipeline is testable for free. Live mode posts to Semaphore's v4 API.
// The API key is read ONLY from env, never hardcoded.
// ============================================================================
const API_BASE = "https://api.semaphore.co/api/v4";

function isLive() {
  return Boolean(process.env.SEMAPHORE_API_KEY);
}

// Normalize a PH mobile number to Semaphore's 11-digit 09xxxxxxxxx form.
// Returns null if it can't be made into a valid PH mobile number.
function normalizePH(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/[^\d+]/g, "");
  if (s.startsWith("+63")) s = "0" + s.slice(3);
  else if (s.startsWith("63") && s.length === 12) s = "0" + s.slice(2);
  else if (s.length === 10 && s.startsWith("9")) s = "0" + s; // 9xxxxxxxxx
  return /^09\d{9}$/.test(s) ? s : null;
}

// Guard: Semaphore SILENTLY DROPS any message whose body starts with "test".
// Never let such a message through — surface it as an error instead.
function assertSendable(message) {
  if (!message || !message.trim()) throw new Error("Empty SMS message.");
  if (/^\s*test\b/i.test(message)) {
    throw new Error('SMS body must not start with "TEST" — Semaphore drops these silently.');
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

  if (!isLive()) {
    return {
      sent: true, simulated: true, message_id: null, status: "sent",
      response: "SIMULATED — no SEMAPHORE_API_KEY set; no SMS actually sent.",
    };
  }

  const body = new URLSearchParams({ apikey: process.env.SEMAPHORE_API_KEY, number: to, message });
  const senderName = sender || process.env.SEMAPHORE_SENDER;
  if (senderName) body.set("sendername", senderName);

  try {
    const res = await fetch(`${API_BASE}/messages`, { method: "POST", body });
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
    return {
      sent: false, simulated: false, message_id: null, status: "failed",
      response: (typeof data === "string" ? data : JSON.stringify(data)).slice(0, 500),
    };
  } catch (e) {
    return { sent: false, simulated: false, message_id: null, status: "failed", response: `Network error: ${e.message}` };
  }
}

// Account credit balance (live only). Returns a number, or null if unavailable.
async function accountBalance() {
  if (!isLive()) return null;
  try {
    const res = await fetch(`${API_BASE}/account?apikey=${encodeURIComponent(process.env.SEMAPHORE_API_KEY)}`);
    const data = await res.json();
    const bal = data && (data.credit_balance != null ? data.credit_balance : data.account_balance);
    return bal != null ? Number(bal) : null;
  } catch {
    return null;
  }
}

module.exports = { isLive, normalizePH, assertSendable, sendSMS, accountBalance };
