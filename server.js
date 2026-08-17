// ============================================================================
// server.js — Express app entry point (Milestone M0 skeleton)
// Boots Express, EJS layouts, sessions, static files, and a placeholder
// dashboard. Routes for each module get added in later milestones.
// ============================================================================
require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const expressLayouts = require("express-ejs-layouts");
const db = require("./db");
const cron = require("node-cron");
const authRoutes = require("./routes/auth");
const patientRoutes = require("./routes/patients");
const appointmentRoutes = require("./routes/appointments");
const reminderRoutes = require("./routes/reminders");
const inventoryRoutes = require("./routes/inventory");
const reportRoutes = require("./routes/reports");
const portalRoutes = require("./routes/portal");
const portalAccountRoutes = require("./routes/portalAccounts");
const accountRoutes = require("./routes/account");
const userRoutes = require("./routes/users");
const immunizationRoutes = require("./routes/immunization");
const prenatalRoutes = require("./routes/prenatal");
const formRoutes = require("./routes/forms");
const reminders = require("./services/reminders");
const { requireLogin } = require("./middleware/auth");
const F = require("./lib/format");

const app = express();
const PORT = process.env.PORT || 3000;

// Render (and most hosts) terminate HTTPS at their edge and forward to this
// app over plain HTTP. Without this, Express never sees the connection as
// secure, so the "secure" session cookie below never gets set/accepted —
// login redirects, then immediately bounces back since no session survived.
app.set("trust proxy", 1);

// ----- Views (EJS + a single shared layout) ---------------------------------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layout");

// ----- Core middleware ------------------------------------------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Sessions live in Postgres (not the default in-memory store), which leaks
// memory over time and — worse on Render's free tier — is wiped every time
// the app sleeps and wakes back up, silently logging everyone out. Falls back
// to the in-memory store only if DATABASE_URL isn't set yet (local first run).
const sessionStore = process.env.DATABASE_URL
  ? new pgSession({ pool: db.getPool(), tableName: "session", createTableIfMissing: true })
  : undefined;

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || "dev-insecure-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  })
);

// Locals available to every view
app.use((req, res, next) => {
  res.locals.appName = "Sampaguita Health Clinic";
  res.locals.user = req.session.user || null; // set at login in M1
  next();
});

// ----- Never let a browser store a page that has records on it ----------------
// Two separate bug reports traced back to this header being missing. In both
// cases the server was doing the right thing and the browser was replaying its
// own saved copy of a page:
//
//   1. Sign out, press Back — the previous page reappeared, apparently still
//      signed in. The session really was destroyed (opening the same URL in an
//      incognito tab correctly bounced to the login page).
//   2. "/" serves the public landing page to visitors and the dashboard to
//      staff. Same address, two different pages. Seconds after signing in, the
//      browser could re-serve the landing copy it had fetched on the way TO the
//      login form, so staff got asked "Ako ay Pasyente / Clinic Staff" again in
//      the middle of signing in. The patient side never showed this because it
//      lands on /portal, a URL the landing page never occupies.
//
// Static assets are mounted above this line and keep their normal caching.
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// ----- Routes ---------------------------------------------------------------
// Health check (handy for uptime pings / deploy)
app.get("/health", async (req, res) => {
  res.json({ ok: true, db: await db.ping() });
});

// External daily reminder trigger for cron-job.org (free hosting sleeps, so the
// in-process cron below may not fire). No session — guarded by CRON_SECRET.
// Responds immediately and processes in the background: a cold Render
// instance can take longer to wake up than cron-job.org's 30s test-run cap,
// so waiting for the full job to finish before replying risks a false
// "timeout" every single morning. The actual outcome is still logged to the
// notifications table and viewable on /reminders regardless.
app.all("/tasks/run-reminders", (req, res) => {
  const token = req.query.token || req.get("x-cron-token");
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  res.json({ ok: true, status: "started" });
  reminders.processReminders({}).catch((e) => console.error("[tasks/run-reminders]", e.message));
});

// Auth (login / logout) — public
app.use("/", authRoutes);

// Patient portal (M5) — public pages + its own patient-session gate.
app.use("/", portalRoutes);

// ---- Public front door -------------------------------------------------------
// Registered BEFORE requireLogin on purpose. "/" used to bounce straight to the
// staff sign-in page, so a patient (or anyone being shown the system) landed on
// "Authorized clinic staff only" and reasonably concluded there was no patient
// side at all — the portal existed but nothing anywhere linked to it. Signed-in
// users skip this and go where they were already going.
// The dashboard now lives at its own address (/dashboard) instead of sharing
// "/" with this page. One URL that renders two completely different pages
// depending on who is asking is what let a cached landing page surface in the
// middle of signing in — and it made "/" impossible to reason about.
app.get("/", (req, res) => {
  if (req.session.user) return res.redirect("/dashboard");
  if (req.session.patient) return res.redirect("/portal");
  res.render("landing", { title: "Sampaguita Health Clinic", layout: false });
});

// Everything below here requires a signed-in staff user.
app.use(requireLogin);

// Real "today" stat for the topbar pill (services no longer map to a fixed
// weekday, so the old day-name lookup was showing a made-up service).
app.use(async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "SELECT count(*)::int n FROM appointments WHERE appointment_date=$1",
      [F.manilaToday()]
    );
    res.locals.todayApptCount = rows[0].n;
  } catch (_) {
    res.locals.todayApptCount = null;
  }
  next();
});

// Feature routes
app.use("/", patientRoutes);
app.use("/", appointmentRoutes);
app.use("/", reminderRoutes);
app.use("/", inventoryRoutes);
app.use("/", reportRoutes);
app.use("/", portalAccountRoutes);
app.use("/", accountRoutes);
app.use("/", userRoutes);
app.use("/", immunizationRoutes);
app.use("/", prenatalRoutes);
app.use("/", formRoutes);

// Dashboard — live setup checklist + real stats (best-effort if DB is up)
app.get("/dashboard", async (req, res) => {
  const dbStatus = await db.ping();
  const setup = {
    database: Boolean(process.env.DATABASE_URL),
    semaphore: Boolean(process.env.SEMAPHORE_API_KEY),
    smtp: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
    session:
      Boolean(process.env.SESSION_SECRET) &&
      process.env.SESSION_SECRET !== "change_this_to_a_long_random_string",
  };

  const todayISO = F.manilaToday();
  let stats = null;
  if (dbStatus.ok) {
    try {
      const [p, t, done, missed] = await Promise.all([
        db.query("SELECT count(*)::int n FROM patients"),
        db.query("SELECT count(*)::int n FROM appointments WHERE appointment_date=$1", [todayISO]),
        db.query("SELECT count(*)::int n FROM appointments WHERE appointment_date=$1 AND status='completed'", [todayISO]),
        db.query("SELECT count(*)::int n FROM appointments WHERE appointment_date=$1 AND status='missed'", [todayISO]),
      ]);
      stats = { patients: p.rows[0].n, today: t.rows[0].n, done: done.rows[0].n, missed: missed.rows[0].n };
    } catch (_) {
      stats = null; // tables not created yet — dashboard still renders
    }
  }

  res.render("dashboard", {
    title: "Dashboard · Sampaguita HC",
    active: "dashboard",
    today: F.longDate(todayISO),
    todayISO,
    dbStatus,
    setup,
    stats,
  });
});

// ----- 404 + error handlers -------------------------------------------------
app.use((req, res) => {
  res.status(404).render("error", {
    title: "Not found",
    active: "",
    code: 404,
    message: "That page doesn't exist yet.",
  });
});

app.use((err, req, res, next) => {
  console.error("[error]", err);
  res.status(500).render("error", {
    title: "Error",
    active: "",
    code: 500,
    message: "Something went wrong on the server.",
  });
});

// ----- Daily reminder job (in-process) --------------------------------------
// Fires while the server is awake. On free hosting that may sleep, ALSO point
// cron-job.org at /tasks/run-reminders?token=CRON_SECRET as a reliable trigger.
const reminderCron = process.env.REMINDER_CRON || "0 8 * * *";
if (cron.validate(reminderCron)) {
  cron.schedule(
    reminderCron,
    async () => {
      try {
        const s = await reminders.processReminders({});
        console.log(`[cron] reminders ${s.date}: ${s.sent} sent, ${s.failed} failed, ${s.skipped} skipped`);
      } catch (e) {
        console.error("[cron] reminder error:", e.message);
      }
    },
    { timezone: F.TZ }
  );
}

// ----- Boot -----------------------------------------------------------------
app.listen(PORT, async () => {
  console.log("\n  Sampaguita Clinic — server is running");
  console.log(`  ▶  http://localhost:${PORT}`);
  const s = await db.ping();
  console.log(s.ok ? "  DB: connected ✓" : `  DB: not connected — ${s.reason}`);
  console.log(
    `  Reminders: ${process.env.SEMAPHORE_API_KEY ? "LIVE (Semaphore)" : "SIMULATION (no API key)"}` +
      ` · daily cron "${reminderCron}" ${F.TZ}\n`
  );
});
