// ============================================================================
// lib/passwordPrompt.js — "set your own password" right after signing in.
//
// Panel review, Oct 2026: an account still on a password somebody else gave
// it (the admin for staff, the desk for patients) is asked to set its own at
// every sign-in until it does. It may be skipped.
//
// The screen sets a new password WITHOUT asking for the current one, because
// the person typed it seconds ago to get here. That is only true right after
// signing in, so sign-in leaves a short-lived mark in the session and the
// screen works only while the mark is fresh. A desk left signed in an hour
// later gets the ordinary password form, which asks for the current password.
// Skipping or saving removes the mark.
// ============================================================================
const FRESH_MS = 30 * 60 * 1000;

// Staff and patient halves of a session are separate (a staff member can be
// signed in to the portal in the same browser), so they get separate marks.
const KEY = { staff: "pwPrompt", patient: "portalPwPrompt" };

function mark(session, side, next) {
  session[KEY[side]] = { at: Date.now(), next: next || null };
}

// The mark, if it is still fresh; otherwise null (and a stale one is removed).
function fresh(session, side) {
  const m = session && session[KEY[side]];
  if (!m) return null;
  if (!(Date.now() - m.at < FRESH_MS)) {
    delete session[KEY[side]];
    return null;
  }
  return m;
}

function clear(session, side) {
  if (session) delete session[KEY[side]];
}

module.exports = { mark, fresh, clear, FRESH_MS };
