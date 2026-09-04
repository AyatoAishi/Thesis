// ============================================================================
// middleware/csrf.js — proof that a POST came from this site's own page.
//
// The hole it closes: the session cookie is sent by the browser on every
// request to this origin, whoever started it. A page on some other site can
// contain a hidden form pointing at /patients/35/delete and submit it while a
// signed-in nurse is looking at something else entirely. The browser attaches
// her cookie, the server sees a valid session, and the record is gone — with
// her name on it in the audit log. She never sees a thing.
//
// The fix is a secret the other site cannot read. A random token is minted per
// session, planted in every form this app renders, and checked on every write.
// A cross-site form can carry the cookie; it cannot carry the token, because
// the same-origin policy stops it reading any page of ours to find one.
//
// Written here rather than pulled in as a package: csurf is deprecated and
// unmaintained, and the whole mechanism is a random string, a hidden input and
// a comparison. A dependency would be more code to trust, not less.
// ============================================================================
const crypto = require("crypto");

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

// Paths that legitimately have no session and no page to carry a token:
// the cron trigger, which proves itself with CRON_SECRET instead.
const EXEMPT = [/^\/tasks\//];

function mint(req) {
  if (!req.session) return null;
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString("base64url");
  return req.session.csrf;
}

// Constant-time compare. A plain === leaks, through timing, how much of the
// token was right — which is enough to reconstruct it a character at a time.
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function csrf(req, res, next) {
  // Every rendered page can reach the token; views/partials/csrf.ejs plants it.
  res.locals.csrfToken = mint(req);

  if (SAFE.has(req.method) || EXEMPT.some((re) => re.test(req.path))) return next();

  const sent = req.body?._csrf || req.get("x-csrf-token") || "";
  if (same(sent, req.session?.csrf || "")) return next();

  // Deliberately not a redirect back to the form. A rejected write means either
  // a genuine cross-site attempt, or a session that expired while the page sat
  // open — and quietly bouncing someone to a fresh page after their submission
  // vanished is how people conclude the system randomly loses their work.
  const err = new Error("This form has expired or did not come from this site. Open the page again and retry.");
  err.status = 403;
  err.csrf = true;
  return next(err);
}

module.exports = { csrf, mint };
