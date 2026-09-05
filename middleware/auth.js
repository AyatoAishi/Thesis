// ============================================================================
// middleware/auth.js — login + role gates (M1)
// Apply requireLogin to anything that needs a signed-in staff user.
// Apply requireRole('admin', ...) to restrict a route to specific roles.
// Data Privacy Act (RA 10173): every record route must be behind requireLogin.
// ============================================================================

// Is this GET a person navigating to a page, or the browser fetching something
// on its own? Only the first is worth coming back to after signing in.
//
// This mattered: a browser asks for /favicon.ico by itself, with no HTML page
// behind it. That request is a GET, it is not signed in, so it used to
// overwrite whatever the person had actually been trying to open — and the
// login then landed them on /favicon.ico, which is a 404. It looked random
// because it is a race: it only won when the favicon request happened to be
// the last one to arrive.
//
// Sec-Fetch-Dest is the browser telling us outright what the request is for
// ("document" only for real navigations). Not every browser sends it, so the
// Accept header and the absence of a file extension back it up.
function isPageNavigation(req) {
  const dest = req.get("sec-fetch-dest");
  if (dest) return dest === "document";
  if (!(req.get("accept") || "").includes("text/html")) return false;
  return !/\.[a-z0-9]{2,5}$/i.test(req.path);
}

// Block anyone who isn't signed in. Remembers where they were headed so we can
// bounce them back after a successful login.
function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.method === "GET" && isPageNavigation(req)) {
    req.session.returnTo = req.originalUrl;
  }
  return res.redirect("/login");
}

// Restrict to one or more roles. Use AFTER requireLogin in the chain.
//   router.get("/x", requireLogin, requireRole("admin"), handler)
function requireRole(...roles) {
  return (req, res, next) => {
    const u = req.session && req.session.user;
    if (!u) return res.redirect("/login");
    if (roles.includes(u.role)) return next();
    return res.status(403).render("error", {
      title: "Access denied",
      active: "",
      code: 403,
      message: "You don't have permission to open this page.",
    });
  };
}

module.exports = { requireLogin, requireRole };
