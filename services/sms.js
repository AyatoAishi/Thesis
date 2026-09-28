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
//   SMSGATE_USERNAME + SMSGATE_PASSWORD   -> the clinic's own Android phone,
//        through "SMS Gateway for Android" (sms-gate.app). Optional:
//        SMSGATE_PASSPHRASE  end-to-end encryption (strongly recommended)
//        SMSGATE_URL         a self-hosted gateway instead of the public one
//
// 2026-09-29: the phone. PhilSMS only reaches Globe and stopped answering;
// Semaphore wants a ₱560 minimum top-up. So texts go out through an Android
// phone on the clinic's own SIM and load: the gateway app receives each message
// over the internet and the phone sends it as an ordinary SMS. Patients see
// that phone's number as the sender, which is why every message starts with
// "Sampaguita Health Clinic:". The PhilSMS and Semaphore adapters stay; either
// can be switched on later with its own variables, and nothing else changes.
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

// 2026-09-22: PhilSMS moved platforms. app.philsms.com is the OLD dashboard and
// they no longer maintain it — an account there cannot even be topped up, which
// is how this was found. The new host is dashboard.philsms.com and the paths and
// payloads are unchanged, so only the base moves. Overridable by env because we
// have now been caught once by a provider changing host underneath us.
const PHILSMS_BASE = process.env.PHILSMS_BASE || "https://dashboard.philsms.com/api/v3";
const SMSGATE_BASE = (process.env.SMSGATE_URL || "https://api.sms-gate.app/3rdparty/v1").replace(/\/+$/, "");
const TIMEOUT_MS = 15000;

// Which adapter is in play. SMS_PROVIDER (philsms | semaphore | smsgate) names
// one outright, and it is used only if its own keys are set; nothing falls
// through to a different provider behind anyone's back. Without it, the first
// configured one wins: PhilSMS, then Semaphore, then the phone. The override
// exists because an old PHILSMS_TOKEN left in a .env silently beat the phone.
function provider() {
  const ready = {
    philsms: !!process.env.PHILSMS_TOKEN,
    semaphore: !!process.env.SEMAPHORE_API_KEY,
    smsgate: !!(process.env.SMSGATE_USERNAME && process.env.SMSGATE_PASSWORD),
  };
  const want = String(process.env.SMS_PROVIDER || "").trim().toLowerCase();
  if (want in ready) return ready[want] ? want : null;
  if (ready.philsms) return "philsms";
  if (ready.semaphore) return "semaphore";
  if (ready.smsgate) return "smsgate";
  return null;
}

function providerName() {
  return { philsms: "PhilSMS", semaphore: "Semaphore", smsgate: "Android phone (SMS Gateway)" }[provider()] || null;
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

// Guard: Semaphore SILENTLY DROPS any message whose body starts with "test", so
// such a message must never be handed to it.
//
// This used to apply to every provider, which was wrong in the most annoying way
// possible: PhilSMS has no such rule, and the very first thing anybody types when
// wiring up a new SMS provider is "TEST". Our own code would refuse it, and the
// refusal reads exactly like a broken setup. The rule belongs to the provider
// that has it.
function assertSendable(message, forProvider = provider()) {
  if (!message || !message.trim()) throw new Error("Empty SMS message.");
  if (forProvider === "semaphore" && /^\s*test\b/i.test(message)) {
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
      // Their docs print `data` as a bare descriptive string, and a single send
      // may come back as an object or wrapped in an array. Success is decided by
      // `status` alone; the id is a bonus we dig for without letting its shape
      // turn a delivered message into a failed one.
      const d = data.data;
      const one = Array.isArray(d) ? d[0] : d;
      const id = one && typeof one === "object" ? (one.uid || one.message_id || one.id) : null;
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

// ---- Android phone (SMS Gateway for Android, sms-gate.app) ------------------
// POST /messages hands the text to the gateway, which pushes it to the phone;
// the phone then sends it over its own SIM. So the API answering "Pending" means
// QUEUED, not sent. Checked a few times over ~6 seconds: an online phone takes
// it within a second or two. A phone that has not picked it up by then is
// recorded as `pending`, never as `sent`, so the log does not claim a text left
// the building when it has not.
//
// Patient data and the relay: the public gateway is a third party. With
// SMSGATE_PASSPHRASE set (and the same passphrase in the phone app's settings),
// the text AND the number are encrypted here and only the phone can read them,
// so the relay only ever sees ciphertext (RA 10173). Format from the gateway's
// docs: AES-256-CBC, key = PBKDF2-SHA1(passphrase, salt, 75000 iterations,
// 32 bytes), the 16-byte random salt doubles as the IV,
// "$aes-256-cbc/pbkdf2-sha1$i=<n>$<salt b64>$<ciphertext b64>".
const SMSGATE_ITERATIONS = 75000;
const SMSGATE_TTL_SECONDS = 12 * 60 * 60;      // a reminder queued while the phone is off must not arrive after the visit
const SMSGATE_ACTIVE_WITHIN_HOURS = 24;         // no phone seen for a day -> fail now, don't queue into the void

function smsgateEncrypt(plain, passphrase) {
  const crypto = require("crypto");
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(passphrase, salt, SMSGATE_ITERATIONS, 32, "sha1");
  const cipher = crypto.createCipheriv("aes-256-cbc", key, salt);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return `$aes-256-cbc/pbkdf2-sha1$i=${SMSGATE_ITERATIONS}$${salt.toString("base64")}$${enc.toString("base64")}`;
}

function smsgateAuth() {
  return "Basic " + Buffer.from(`${process.env.SMSGATE_USERNAME}:${process.env.SMSGATE_PASSWORD}`).toString("base64");
}

async function smsgateState(id) {
  const t = withTimeout();
  try {
    const res = await fetch(`${SMSGATE_BASE}/messages/${encodeURIComponent(id)}`, {
      signal: t.signal, headers: { Authorization: smsgateAuth(), Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    t.done();
  }
}

// The reason a failed message gives, wherever the gateway put it.
function smsgateReason(d) {
  if (!d) return "";
  const r = Array.isArray(d.recipients) ? d.recipients.find((x) => x && x.error) : null;
  return (r && r.error) || d.reason || d.error || d.message || "";
}

async function sendSmsGate(local09, message) {
  const pass = process.env.SMSGATE_PASSPHRASE || "";
  const e164 = "+63" + local09.slice(1);
  const body = {
    textMessage: { text: pass ? smsgateEncrypt(message, pass) : message },
    phoneNumbers: [pass ? smsgateEncrypt(e164, pass) : e164],
    ttl: SMSGATE_TTL_SECONDS,
    withDeliveryReport: true,
    isEncrypted: !!pass,
  };
  const t = withTimeout();
  let data, text, res;
  try {
    res = await fetch(`${SMSGATE_BASE}/messages?deviceActiveWithin=${SMSGATE_ACTIVE_WITHIN_HOURS}`, {
      method: "POST",
      signal: t.signal,
      headers: { Authorization: smsgateAuth(), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    text = await res.text();
    try { data = JSON.parse(text); } catch { data = null; }
  } catch (e) {
    return failed(e.name === "AbortError" ? "SMS gateway request timed out." : `Network error: ${e.message}`);
  } finally {
    t.done();
  }
  if (!res.ok || !data || !data.id) {
    const why = res.status === 401 ? "the username/password was refused"
      : /no active device/i.test(text || "") ? "the phone has not been online in the last 24 hours"
      : (text || "").slice(0, 300);
    return failed(`SMS gateway ${res.status}: ${why}`);
  }

  // Queued. Give an online phone a moment to take it.
  let state = data.state, d = data;
  for (let i = 0; i < 3 && (!state || state === "Pending"); i++) {
    await new Promise((r) => setTimeout(r, Number(process.env.SMSGATE_POLL_MS) || 2000));
    const now = await smsgateState(data.id);
    if (now && now.state) { d = now; state = now.state; }
  }
  const id = String(data.id);
  if (state === "Failed") return { ...failed(`Phone could not send it: ${smsgateReason(d) || "no reason given"}`), message_id: id };
  if (!state || state === "Pending") {
    return { sent: false, simulated: false, message_id: id, status: "pending",
             response: "Queued, but the phone has not picked it up yet — check that it is on, online, and the app is running." };
  }
  return { sent: true, simulated: false, message_id: id, status: "sent",
           response: `Sent by the clinic phone (${state}).` };
}

// Where a message stands now, for the test button: Pending / Processed / Sent /
// Delivered / Failed. Only the phone gateway can be asked; null otherwise.
async function messageState(id) {
  if (provider() !== "smsgate" || !id) return null;
  const d = await smsgateState(id);
  return d ? { state: d.state || null, reason: smsgateReason(d) || null } : null;
}

// Send one SMS. Always resolves (never throws on network/provider failure) with:
//   { sent, simulated, message_id, status: 'sent'|'pending'|'failed', response }
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
  if (p === "philsms") return sendPhilSMS(to, message);
  if (p === "semaphore") return sendSemaphore(to, message, sender);
  return sendSmsGate(to, message);
}

// Remaining credit, if the provider will tell us. Returns a number, or null.
async function accountBalance() {
  const p = provider();
  if (!p || p === "smsgate") return null;   // the phone's load is not visible to the gateway
  const t = withTimeout();
  try {
    if (p === "philsms") {
      const res = await fetch(`${PHILSMS_BASE}/balance`, {
        signal: t.signal,
        headers: { Authorization: `Bearer ${process.env.PHILSMS_TOKEN}`, Accept: "application/json" },
      });
      // Verified against the live endpoint, 2026-09-22:
      //   {"status":"success","data":{"remaining_balance":"₱0","expired_on":"…"}}
      // The field is remaining_balance, not balance, and it is a STRING with a
      // peso sign and possibly thousands separators in it — so it is stripped
      // to digits before Number() sees it. Reading `balance` returned null
      // forever and looked exactly like a dead token.
      const data = await res.json();
      const d = (data && data.data) || {};
      const raw = d.remaining_balance != null ? d.remaining_balance : d.balance;
      if (raw == null) return null;
      const n = Number(String(raw).replace(/[^\d.-]/g, ""));
      return Number.isFinite(n) ? n : null;
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

module.exports = {
  isLive, provider, providerName, normalizePH, toIntl, assertSendable, sendSMS, accountBalance,
  messageState, smsgateEncrypt,
};
