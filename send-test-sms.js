/*
 * send-test-sms.js  —  Barangay Sampaguita Clinic system
 * --------------------------------------------------------
 * A tiny, REAL test of the Semaphore SMS API.
 * Goal: prove your code can make a phone buzz. Once this works,
 * the scary part of your thesis (the SMS system) is basically solved.
 *
 * No libraries needed. Node 18+ has a built-in `fetch`. You have Node 22, so you're good.
 *
 * HOW TO RUN (in a terminal, inside this folder):
 *   1) Get your API key:  https://semaphore.co  ->  sign up  ->  Dashboard -> API
 *   2) Put your key + sender name below (or set them as environment variables).
 *   3) Run:   node send-test-sms.js 09XXXXXXXXX "Your message here"
 *      Example:  node send-test-sms.js 09171234567 "Hello from our clinic system"
 *
 * IMPORTANT GOTCHA (from the official docs):
 *   Do NOT start your message with the word "TEST".
 *   Semaphore SILENTLY ignores those — it looks like it sent, but nothing arrives.
 *   That single rule has wasted many hours for people. You're welcome. :)
 */

// ----- 1) CONFIG -------------------------------------------------------------
// Prefer environment variables so you never commit your secret key to GitHub.
// If you don't set env vars, it falls back to the strings here (edit these).
const API_KEY     = process.env.SEMAPHORE_API_KEY || "PASTE_YOUR_API_KEY_HERE";
const SENDER_NAME = process.env.SEMAPHORE_SENDER  || ""; // leave "" to use your account default

const BASE = "https://api.semaphore.co/api/v4";

// ----- 2) SEND ONE SMS -------------------------------------------------------
async function sendSMS(number, message) {
  // Safety check so you don't burn a credit on the silent-drop bug.
  if (message.trim().toUpperCase().startsWith("TEST")) {
    throw new Error('Your message starts with "TEST" — Semaphore will silently ignore it. Reword it.');
  }

  // The API expects form-encoded data (like an HTML form), not JSON.
  const body = new URLSearchParams({
    apikey: API_KEY,
    number: number,        // e.g. "09171234567" — PH mobile number
    message: message,
  });
  if (SENDER_NAME) body.append("sendername", SENDER_NAME);

  const res = await fetch(`${BASE}/messages`, { method: "POST", body });
  const data = await res.json();

  // Semaphore returns an ARRAY of message objects (one per recipient).
  if (!res.ok || data.error) {
    throw new Error("Semaphore rejected the request: " + JSON.stringify(data));
  }

  const msg = Array.isArray(data) ? data[0] : data;
  console.log("\n✅ Request accepted by Semaphore!");
  console.log("   message_id :", msg.message_id);
  console.log("   recipient  :", msg.recipient);
  console.log("   network    :", msg.network);    // Globe / Smart / etc.
  console.log("   status     :", msg.status);      // Queued -> Pending -> Sent
  console.log("   sender     :", msg.sender_name);
  console.log("\nNote: status starts as 'Pending/Queued'. The text usually arrives within seconds.");
  return msg;
}

// ----- 3) CHECK YOUR CREDIT BALANCE -----------------------------------------
// Run this anytime to see how many SMS you have left. 1 credit = 1 SMS (160 chars).
async function checkBalance() {
  const res = await fetch(`${BASE}/account?apikey=${encodeURIComponent(API_KEY)}`);
  const data = await res.json();
  console.log("\n💰 Account:", data.account_name, "| Credits left:", data.credit_balance);
  return data.credit_balance;
}

// ----- 4) RUN IT -------------------------------------------------------------
(async () => {
  try {
    if (API_KEY === "PASTE_YOUR_API_KEY_HERE") {
      console.log("⚠️  Set your API key first (edit API_KEY at the top, or set SEMAPHORE_API_KEY).");
      return;
    }

    const number  = process.argv[2];                      // first argument after the filename
    const message = process.argv[3] || "Hello! This is a working test from our clinic system.";

    await checkBalance();   // show balance before sending

    if (!number) {
      console.log('\nNo number given. Usage:  node send-test-sms.js 09XXXXXXXXX "your message"');
      return;
    }

    await sendSMS(number, message);
  } catch (err) {
    console.error("\n❌ Error:", err.message);
  }
})();
