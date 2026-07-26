// ============================================================================
// middleware/auth.js — login + role gates (M1)
// Apply requireLogin to anything that needs a signed-in staff user.
// Apply requireRole('admin', ...) to restrict a route to specific roles.
// Data Privacy Act (RA 10173): every record route must be behind requireLogin.
// ============================================================================

// Block anyone who isn't signed in. Remembers where they were headed so we can
// bounce them back after a successful login.
function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.method === "GET") req.session.returnTo = req.originalUrl;
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
