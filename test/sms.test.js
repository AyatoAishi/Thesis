// ============================================================================
// test/sms.test.js — the SMS adapters, with the network replaced.
//
// No real text is sent: global fetch is swapped for a fake gateway that
// records what it was asked and answers the way the real one does. What is
// checked is what a phone gateway cannot tell us on its own until a patient
// misses a reminder:
//   1. which provider is chosen from which settings
//   2. the request the phone gateway receives (E.164 number, TTL, the
//      "phone seen recently" guard) and that it is encrypted when a
//      passphrase is set, in the format the phone app expects
//   3. that "queued" is never reported as "sent", and a failure never as
//      success
//
//   node test/sms.test.js
// ============================================================================
const crypto = require("crypto");
const path = require("path");

let bad = 0;
const check = (label, ok, extra = "") => {
  if (!ok) bad++;
  if (!ok || process.env.VERBOSE) console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${extra ? "   " + extra : ""}`);
};

const KEYS = ["SMS_PROVIDER", "PHILSMS_TOKEN", "SEMAPHORE_API_KEY", "SMSGATE_USERNAME", "SMSGATE_PASSWORD", "SMSGATE_PASSPHRASE", "SMSGATE_URL"];
function fresh(env) {
  KEYS.forEach((k) => delete process.env[k]);
  Object.assign(process.env, env);
  process.env.SMSGATE_POLL_MS = "1";
  delete require.cache[path.join(__dirname, "..", "services", "sms.js")];
  return require("../services/sms");
}

// The documented decryption: PBKDF2-SHA1 (75000, 32 bytes), AES-256-CBC, salt = IV.
function decrypt(value, pass) {
  const [, algo, iter, salt64, ct64] = value.split("$");
  if (algo !== "aes-256-cbc/pbkdf2-sha1") throw new Error("wrong algorithm tag: " + algo);
  const salt = Buffer.from(salt64, "base64");
  const key = crypto.pbkdf2Sync(pass, salt, Number(iter.slice(2)), 32, "sha1");
  const d = crypto.createDecipheriv("aes-256-cbc", key, salt);
  return Buffer.concat([d.update(Buffer.from(ct64, "base64")), d.final()]).toString("utf8");
}

// A fake gateway: answers POST with `post`, then each GET with the next of `states`.
function fakeGateway({ post, states = [] }) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    if ((opts.method || "GET") === "POST") {
      return { ok: post.status < 300, status: post.status, text: async () => JSON.stringify(post.body), json: async () => post.body };
    }
    const next = states.length ? states.shift() : { id: "m1", state: "Pending" };
    return { ok: true, status: 200, json: async () => next, text: async () => JSON.stringify(next) };
  };
  return calls;
}

(async () => {
  // ---- 1) which provider
  check("nothing set: simulation", fresh({}).provider() === null);
  check("phone gateway needs both username and password", fresh({ SMSGATE_USERNAME: "u" }).provider() === null);
  check("username + password: the phone", fresh({ SMSGATE_USERNAME: "u", SMSGATE_PASSWORD: "p" }).provider() === "smsgate");
  check("…and it says so by name", /Android phone/.test(fresh({ SMSGATE_USERNAME: "u", SMSGATE_PASSWORD: "p" }).providerName()));
  check("a paid provider, if configured, is used instead",
    fresh({ SMSGATE_USERNAME: "u", SMSGATE_PASSWORD: "p", SEMAPHORE_API_KEY: "k" }).provider() === "semaphore");
  check("SMS_PROVIDER=smsgate picks the phone even with an old PhilSMS token around",
    fresh({ SMS_PROVIDER: "smsgate", PHILSMS_TOKEN: "old", SMSGATE_USERNAME: "u", SMSGATE_PASSWORD: "p" }).provider() === "smsgate");
  check("SMS_PROVIDER naming a provider with no keys is simulation, not a silent switch",
    fresh({ SMS_PROVIDER: "smsgate", PHILSMS_TOKEN: "old" }).provider() === null);
  check("SMS_PROVIDER is not case-sensitive", fresh({ SMS_PROVIDER: " SMSGate ", SMSGATE_USERNAME: "u", SMSGATE_PASSWORD: "p" }).provider() === "smsgate");

  // ---- 2) the request, unencrypted
  let sms = fresh({ SMSGATE_USERNAME: "clinic", SMSGATE_PASSWORD: "secret" });
  let calls = fakeGateway({ post: { status: 202, body: { id: "m1", state: "Pending" } }, states: [{ id: "m1", state: "Sent" }] });
  let r = await sms.sendSMS("09171234567", "Sampaguita Health Clinic: Paalala po.");
  const sent = calls[0], body = JSON.parse(sent.opts.body);
  check("posts to the gateway's messages endpoint", sent.url.startsWith("https://api.sms-gate.app/3rdparty/v1/messages?"));
  check("refuses a phone not seen for 24 hours", /deviceActiveWithin=24/.test(sent.url));
  check("basic auth with the app's credentials", sent.opts.headers.Authorization === "Basic " + Buffer.from("clinic:secret").toString("base64"));
  check("number in E.164 (+63…)", body.phoneNumbers[0] === "+639171234567", body.phoneNumbers[0]);
  check("text as given", body.textMessage.text === "Sampaguita Health Clinic: Paalala po.");
  check("expires after 12 hours", body.ttl === 43200);
  check("not marked encrypted", body.isEncrypted === false);
  check("queued, then Sent -> reported as sent", r.status === "sent" && r.sent === true && r.message_id === "m1", JSON.stringify(r));

  // ---- 2b) encrypted
  sms = fresh({ SMSGATE_USERNAME: "clinic", SMSGATE_PASSWORD: "secret", SMSGATE_PASSPHRASE: "k4l1p4y" });
  calls = fakeGateway({ post: { status: 202, body: { id: "m2", state: "Pending" } }, states: [{ id: "m2", state: "Processed" }] });
  r = await sms.sendSMS("+63 917 123 4567", "Si Maria ay may appointment bukas.");
  const eb = JSON.parse(calls[0].opts.body);
  check("marked encrypted", eb.isEncrypted === true);
  check("the relay cannot read the text", !eb.textMessage.text.includes("Maria") && eb.textMessage.text.startsWith("$aes-256-cbc/pbkdf2-sha1$i=75000$"));
  check("…nor the number", !eb.phoneNumbers[0].includes("917") && eb.phoneNumbers[0].startsWith("$aes-256-cbc/"));
  check("the phone can decrypt the text", decrypt(eb.textMessage.text, "k4l1p4y") === "Si Maria ay may appointment bukas.");
  check("…and the number, in E.164", decrypt(eb.phoneNumbers[0], "k4l1p4y") === "+639171234567");
  check("a fresh salt every time", sms.smsgateEncrypt("x", "p") !== sms.smsgateEncrypt("x", "p"));
  check("Processed counts as sent", r.status === "sent");

  // ---- 3) the outcomes that must not be dressed up
  sms = fresh({ SMSGATE_USERNAME: "clinic", SMSGATE_PASSWORD: "secret" });
  fakeGateway({ post: { status: 202, body: { id: "m3", state: "Pending" } }, states: [{ id: "m3", state: "Pending" }, { id: "m3", state: "Pending" }, { id: "m3", state: "Pending" }] });
  r = await sms.sendSMS("09171234567", "x");
  check("never picked up by the phone -> pending, NOT sent", r.status === "pending" && r.sent === false, JSON.stringify(r));

  fakeGateway({ post: { status: 202, body: { id: "m4", state: "Pending" } }, states: [{ id: "m4", state: "Failed", recipients: [{ phoneNumber: "+639171234567", state: "Failed", error: "RESULT_ERROR_NO_SERVICE" }] }] });
  r = await sms.sendSMS("09171234567", "x");
  check("the phone failed -> failed, with its reason", r.status === "failed" && /NO_SERVICE/.test(r.response), r.response);

  fakeGateway({ post: { status: 401, body: { message: "Unauthorized" } } });
  r = await sms.sendSMS("09171234567", "x");
  check("wrong password -> failed, said plainly", r.status === "failed" && /refused/.test(r.response), r.response);

  fakeGateway({ post: { status: 400, body: { message: "No active device with such ID found" } } });
  r = await sms.sendSMS("09171234567", "x");
  check("phone offline for a day -> failed, said plainly", r.status === "failed" && /24 hours/.test(r.response), r.response);

  global.fetch = async () => { throw new Error("getaddrinfo ENOTFOUND api.sms-gate.app"); };
  r = await sms.sendSMS("09171234567", "x");
  check("no internet -> failed, not a crash", r.status === "failed" && /Network error/.test(r.response));

  r = await sms.sendSMS("12345", "x");
  check("a bad number is refused before any request", r.status === "failed" && /Invalid PH number/.test(r.response));

  check("the phone's load is not reported as a balance", (await sms.accountBalance()) === null);

  console.log(bad ? `\n  ${bad} check(s) failed.` : "\n  SMS adapters: provider choice, request shape, encryption and every outcome check out.");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
