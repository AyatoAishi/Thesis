// ============================================================================
// server.js — Express app entry point (Milestone M0 skeleton)
// Boots Express, EJS layouts, sessions, static files, and a placeholder
// dashboard. Routes for each module get added in later milestones.
// ============================================================================
require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");
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
const reminders = require("./services/reminders");
const { requireLogin } = require("./middleware/auth");
const F = require("./lib/format");

const app = express();
const PORT = process.env.PORT || 3000;

// ----- Views (EJS + a single shared layout) ---------------------------------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layout");

// ----- Core middleware ------------------------------------------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
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

// ----- Routes ---------------------------------------------------------------
// Health check (handy for uptime pings / deploy)
app.get("/health", async (req, res) => {
  res.json({ ok: true, db: await db.ping() });
});

// External daily reminder trigger for cron-job.org (free hosting sleeps, so the
// in-process cron below may not fire). No session — guarded by CRON_SECRET.
app.all("/tasks/run-reminders", async (req, res) => {
  const token = req.query.token || req.get("x-cron-token");
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  try {
    const summary = await reminders.processReminders({});
    res.json({ ok: true, ...summary });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Auth (login / logout) — public
app.use("/", authRoutes);

// Patient portal (M5) — public pages + its own patient-session gate.
app.use("/", portalRoutes);

// Everything below here requires a signed-in staff user.
app.use(requireLogin);

// Feature routes
app.use("/", patientRoutes);
app.use("/", appointmentRoutes);
app.use("/", reminderRoutes);
app.use("/", inventoryRoutes);
app.use("/", reportRoutes);
app.use("/", portalAccountRoutes);

// Dashboard — live setup checklist + real stats (best-effort if DB is up)
app.get("/", async (req, res) => {
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
