// ============================================================================
// lib/phone.js — Philippine mobile numbers, in one shape: 09xxxxxxxxx.
//
// "Fixed 11 digits mobile numbers. Format: 09xxxxxxxxx. If not 11 digits, add
// error message." — the professors' review. Until now the patient form took
// anything from 7 to 15 digits, and the live database shows what that allowed:
// 12-, 14- and 15-digit "numbers" that no SMS gateway will ever deliver to.
//
// One exception to "reject anything else", and it is a kindness rather than a
// loophole: a number pasted in international form — "+63 917 123 4567", or
// "639171234567" — is the SAME number, and is rewritten to 09171234567 rather
// than bounced back. What gets STORED is always the 11-digit form, so every
// screen, report and SMS gateway sees one format.
// ============================================================================

const MOBILE_RE = /^09\d{9}$/;

// Digits only, with the country code folded into a leading 0 when it is
// unambiguous. Returns "" for blank input so callers can tell empty from bad.
function normalizeMobile(raw) {
  let d = String(raw == null ? "" : raw).replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("639")) d = "0" + d.slice(2);
  else if (d.length === 10 && d.startsWith("9")) d = "0" + d;
  return d;
}

const isMobile = (s) => MOBILE_RE.test(String(s || ""));

// The sentence a person reads. Names the field, gives the rule and an example,
// and says how many digits they actually typed — "must be 11 digits" alone
// leaves somebody counting on their fingers.
function mobileError(label, value) {
  const n = String(value || "").length;
  return `${label} must be 11 digits in the format 09xxxxxxxxx (e.g. 09171234567)` +
    (n ? ` — you entered ${n} digit${n === 1 ? "" : "s"}.` : ".");
}

module.exports = { normalizeMobile, isMobile, mobileError, MOBILE_RE };
