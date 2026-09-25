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
const legalRoutes = require("./routes/legal");
const cal = require("./lib/calendar");
const patientRoutes = require("./routes/patients");
const familyRoutes = require("./routes/families");
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
const visitRoutes = require("./routes/visits");
const formRoutes = require("./routes/forms");
const helpRoutes = require("./routes/help");
const reminders = require("./services/reminders");
const immSchedule = require("./services/immunizationSchedule");
const imm = require("./lib/immunizationCard");
const { requireLogin } = require("./middleware/auth");
const { csrf } = require("./middleware/csrf");
const F = require("./lib/format");
const theme = require("./lib/theme");

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

// Every write from here on must carry this session’s token. Mounted straight
// after the session (which it stores the token in) and the body parser
// (which is what reads it back off the form), and before every route —
// including /login and the portal, because a forged sign-in is its own
// attack: log somebody into an account the attacker controls, and whatever
// they do next is recorded against it.
app.use(csrf);

// Locals available to every view
app.use((req, res, next) => {
  res.locals.appName = "Sampaguita Health Clinic";
  res.locals.user = req.session.user || null; // set at login in M1
  // The signed-in account's own appearance, resolved and memoised in
  // lib/theme.js. Signed-out pages get the defaults from the same code path,
  // so the login screen and the portal never depend on somebody's settings.
  res.locals.theme = theme.forUser(req.session.user && req.session.user.preferences);
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
// The whole daily pass. The order is not arbitrary: the immunization sweep has
// to mark yesterday's no-shows and book the coming doses BEFORE the reminder
// run goes looking for scheduled appointments, or a dose booked this morning
// waits an extra day for its reminder and a parent gets a reminder for a
// session that has already been and gone.
async function runDailyJobs() {
  const immResult = await immSchedule.runDaily();
  const remResult = await reminders.processReminders({});
  return { immunization: immResult, reminders: remResult };
}

app.all("/tasks/run-reminders", (req, res) => {
  const token = req.query.token || req.get("x-cron-token");
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  res.json({ ok: true, status: "started" });
  // The URL keeps its name: it is already registered at cron-job.org, and a
  // renamed endpoint would mean a silently dead schedule until someone noticed.
  runDailyJobs().catch((e) => console.error("[tasks/run-reminders]", e.message));
});

// Auth (login / logout) — public
app.use("/", authRoutes);

// Privacy notice and terms — public, and above the login gate on purpose:
// the reader who needs them most is the patient deciding whether to consent,
// who has no account at all.
app.use("/", legalRoutes);

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

// The icon lives at /favicon.svg and every page links to it, but a browser
// that ignores the link asks for /favicon.ico anyway. Answered here, above the
// login gate, so that automatic request never becomes a redirect to the sign-in
// page — which is how it used to end up remembered as "where they were headed"
// and hand somebody a 404 straight after signing in. 204: nothing to send, and
// nothing is wrong.
app.get("/favicon.ico", (req, res) => res.status(204).end());

// Everything below here requires a signed-in staff user.
app.use(requireLogin);

// Mounted ABOVE the topbar middleware below, and that placement is the whole
// point. These are JSON endpoints for Ate Sam; they render no shell, so the
// topbar counts are of no use to them — but the middleware runs on every
// authenticated request, and its one query is a full round trip to a database
// on another continent. The search box asks on every keystroke, so leaving the
// help routes underneath it meant every letter typed cost a needless trip to
// Neon: measured at 226ms each from here, against 0.44ms for the search
// itself. Practically all of the wait was work nobody had asked for.
//
// The trade is that a staff account deactivated mid-session can still read
// help text until their next page load. Help contains no patient data and no
// actions, so that costs nothing; anything that touches a record still goes
// through the check below.
app.use("/", helpRoutes);

// Two jobs, one round trip: re-check that the signed-in user is still who the
// database says they are, and fetch the numbers the topbar shows.
//
// The re-check matters more than it looks. requireLogin above only proves a
// session exists; the role and status inside it were copied in at sign-in and
// then never looked at again. So deactivating a staff account — the thing the
// panel specifically asked for in v1.1 — did nothing to anyone already signed
// in, and demoting a nurse left them with nurse powers, both until their
// session happened to expire up to eight hours later. The account page said one
// thing and the running system did another.
//
// It rides along with the topbar counts because this runs on every single
// authenticated request and the database is a free-tier instance an ocean away.
// One query before, one query now.
app.use(async (req, res, next) => {
  // Another sign-in on this account, or a password change, marked this session
  // to end (lib/sessions.js). Checked before anything else so it costs nothing
  // in the normal case, and ended here rather than at the moment it was marked
  // so the person is told what happened instead of silently landing on the
  // sign-in page wondering whether something broke.
  if (req.session.endedBecause) {
    const why = req.session.endedBecause;
    return req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.redirect(`/login?ended=${encodeURIComponent(why)}`);
    });
  }

  try {
    const { rows } = await db.query(
      `SELECT
         (SELECT count(*)::int FROM appointments WHERE appointment_date=$1) AS today_appts,
         (SELECT count(*)::int FROM appointments WHERE appointment_date=$1 AND status='scheduled') AS today_waiting,
         (SELECT count(*)::int FROM medicines WHERE archived_at IS NULL AND stock_quantity < low_stock_threshold) AS low_stock,
         (SELECT count(DISTINCT b.medicine_id)::int FROM medicine_batches b JOIN medicines m ON m.medicine_id = b.medicine_id
           WHERE b.disposed_at IS NULL AND b.expired_quantity > 0) AS expired_meds,
         ${imm.overdueChildrenSql({ names: "$3", doses: "$4", weeks: "$5", today: "$1", maxAge: "$6" })} AS imm_overdue,
         (SELECT role   FROM users WHERE user_id=$2) AS live_role,
         (SELECT status FROM users WHERE user_id=$2) AS live_status,
         (SELECT full_name FROM users WHERE user_id=$2) AS live_name`,
      [F.manilaToday(), req.session.user.user_id,
       imm.DUE_ARRAYS.names, imm.DUE_ARRAYS.doses, imm.DUE_ARRAYS.weeks, imm.EPI_MAX_AGE_YEARS]
    );
    const c = rows[0];

    // Deleted or switched off since they signed in — end it here.
    if (!c.live_status || c.live_status !== "active") {
      return req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.redirect("/login?ended=inactive");
      });
    }
    // Role or name changed under them — carry the new one, don't sign them out.
    req.session.user.role = c.live_role;
    req.session.user.full_name = c.live_name;
    res.locals.user = req.session.user;

    res.locals.todayApptCount = c.today_appts;

    // Only what this role can actually act on — a bell that shows a facilitator
    // a stock problem they can't fix is just noise they learn to ignore.
    const role = (req.session.user && req.session.user.role) || "";
    const all = [
      { key: "today_waiting", n: c.today_waiting, href: "/appointments",
        label: `${c.today_waiting} patient${c.today_waiting === 1 ? "" : "s"} still expected today`,
        roles: ["nurse", "facilitator", "recorder", "admin"] },
      // "Possible kaya na yung mga overdue list lang ang makikita pagka open
      // ng kung sino sino overdue from notifications? Para lang mas
      // straightforward sha" — Alyanna. It used to open the whole list of 13
      // and leave her to hunt for the red badges.
      { key: "imm_overdue", n: c.imm_overdue, href: "/patients?overdue=1",
        label: `${c.imm_overdue} child${c.imm_overdue === 1 ? "" : "ren"} overdue for immunization`,
        roles: ["nurse", "facilitator", "recorder", "admin"] },
      { key: "low_stock", n: c.low_stock, href: "/inventory?low=1",
        label: `${c.low_stock} medicine${c.low_stock === 1 ? "" : "s"} low on stock`,
        roles: ["nurse", "admin"] },
      // Expired boxes still on the shelf. They are already out of usable stock
      // (lib/stock.js), so this is about the physical box: somebody has to
      // take it off the shelf and record it, or it gets handed out by hand.
      { key: "expired", n: c.expired_meds, href: "/inventory?expired=1",
        label: `${c.expired_meds} medicine${c.expired_meds === 1 ? " has" : "s have"} expired stock to dispose of`,
        roles: ["nurse", "admin"] },
    ];
    res.locals.alerts = all.filter((a) => a.n > 0 && a.roles.includes(role));
  } catch (_) {
    // A database hiccup must not sign the whole clinic out mid-consultation.
    // The counts degrade to nothing; the session stays. Anything that actually
    // touches a record will fail loudly on its own query a moment later.
    res.locals.todayApptCount = null;
    res.locals.alerts = [];
  }
  next();
});

// Feature routes
app.use("/", patientRoutes);
app.use("/", familyRoutes);
app.use("/", appointmentRoutes);
app.use("/", reminderRoutes);
app.use("/", inventoryRoutes);
app.use("/", reportRoutes);
app.use("/", portalAccountRoutes);
app.use("/", accountRoutes);
app.use("/", userRoutes);
app.use("/", immunizationRoutes);
app.use("/", prenatalRoutes);
app.use("/", visitRoutes);
app.use("/", formRoutes);

// Dashboard — the clinic's numbers for today.
//
// This used to open with a setup checklist reading environment variables back
// to whoever was signed in. It was for us during the build and it never got
// taken down: the people who actually open this screen every morning cannot
// act on a missing DATABASE_URL, and it described our infrastructure to
// anyone standing at the desk. Removed; the checklist is on Trello now.
//
// db.ping() went with it. The page's own queries fail loudly enough if the
// database is unreachable, and a "connected" badge was one more round trip to
// a free instance an ocean away, on the busiest page in the system.
app.get("/dashboard", async (req, res) => {
  const todayISO = F.manilaToday();

  // The calendar reads two things off the URL and validates both, because a
  // hand-typed or stale ?d= should land on a real day rather than on a blank
  // page with no explanation. Selecting a day inside a different month moves
  // the grid to that month, so a bookmarked link always opens showing the day
  // it points at.
  const selected = cal.validDate(req.query.d) || todayISO;
  const month = cal.parseMonth(req.query.m || selected.slice(0, 7), todayISO);

  let stats = null;
  let calendar = null;
  let dayAppts = [];

  try {
    const grid = cal.buildMonth(month, {}, todayISO, selected);

    const [p, t, done, missed, monthCounts, day] = await Promise.all([
      db.query("SELECT count(*)::int n FROM patients"),
      db.query("SELECT count(*)::int n FROM appointments WHERE appointment_date=$1", [todayISO]),
      db.query("SELECT count(*)::int n FROM appointments WHERE appointment_date=$1 AND status='completed'", [todayISO]),
      db.query("SELECT count(*)::int n FROM appointments WHERE appointment_date=$1 AND status='missed'", [todayISO]),
      // One query for the whole month rather than one per day. 30 round trips
      // to a database an ocean away is the difference between a page and a
      // wait, and the grid only needs counts.
      db.query(
        `SELECT to_char(appointment_date, 'YYYY-MM-DD') AS d,
                count(*)::int AS total,
                count(*) FILTER (WHERE status = 'missed')::int AS missed,
                count(*) FILTER (WHERE status = 'scheduled')::int AS scheduled
           FROM appointments
          WHERE appointment_date BETWEEN $1 AND $2
          GROUP BY 1`,
        [grid.firstDay, grid.lastDay]
      ),
      // The selected day in full. Separate from the counts because this is the
      // only day whose names and times anybody is reading.
      db.query(
        `SELECT a.appointment_id, a.appointment_time, a.status, a.notes,
                s.name AS service_name,
                p.patient_id, p.patient_number, p.full_name
           FROM appointments a
           JOIN services s ON s.service_id = a.service_id
           JOIN patients p ON p.patient_id = a.patient_id
          WHERE a.appointment_date = $1
          ORDER BY a.appointment_time NULLS LAST, p.full_name`,
        [selected]
      ),
    ]);

    stats = { patients: p.rows[0].n, today: t.rows[0].n, done: done.rows[0].n, missed: missed.rows[0].n };

    const counts = {};
    monthCounts.rows.forEach((r) => {
      counts[r.d] = { total: r.total, missed: r.missed, scheduled: r.scheduled };
    });
    calendar = cal.buildMonth(month, counts, todayISO, selected);
    dayAppts = day.rows;
  } catch (_) {
    stats = null; // tables not created yet — dashboard still renders
    calendar = null;
  }

  res.render("dashboard", {
    title: "Dashboard · Sampaguita HC",
    active: "dashboard",
    today: F.longDate(todayISO),
    todayISO,
    stats,
    calendar,
    selected,
    selectedLabel: F.longDate(selected),
    dayAppts,
    weekdays: cal.WEEKDAYS,
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
  // A rejected form is not a server fault, and saying "something went wrong
  // on the server" would send somebody hunting for a bug that is not there.
  // The usual cause is innocent: a page left open past the 8-hour session.
  if (err && err.csrf) {
    console.warn("[csrf] rejected", req.method, req.originalUrl);
    return res.status(403).render("error", {
      title: "Form expired",
      active: "",
      code: 403,
      message: err.message,
    });
  }
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

// Serverless has no long-running process to hold a timer, so scheduling one
// there is not a cron — it is a timer registered on a function that is about to
// be frozen, re-registered on the next request, and never fired. Skipped
// outright rather than left to look like it works.
//
// Nothing is lost. cron-job.org already calls /tasks/run-reminders on a
// schedule, and that has always been the reliable trigger; this one only ever
// covered the case where the server happened to be awake.
const SERVERLESS = !!process.env.VERCEL;
if (!SERVERLESS && cron.validate(reminderCron)) {
  cron.schedule(
    reminderCron,
    async () => {
      try {
        const { immunization: i, reminders: s } = await runDailyJobs();
        console.log(
          `[cron] immunization ${i.date}: ${i.scheduled.booked} dose(s) booked for ` +
            `${i.scheduled.patients} patient(s), ${i.missed.doses} dose(s) and ` +
            `${i.missed.appointments} appointment(s) marked missed`
        );
        console.log(`[cron] reminders ${s.date}: ${s.sent} sent, ${s.failed} failed, ${s.skipped} skipped`);
      } catch (e) {
        console.error("[cron] daily job error:", e.message);
      }
    },
    { timezone: F.TZ }
  );
}

// ----- Boot -----------------------------------------------------------------
// Two ways in, and this is the whole of the difference between them.
//
//   node server.js          -> require.main === module, so it listens on a port
//   a serverless platform   -> imports this file and calls the exported app
//                              itself, one invocation per request
//
// Exported either way, so the local behaviour is byte-identical to what it was
// before and nothing about running it on a real server changed.
module.exports = app;

if (require.main !== module) {
  // Imported, not run. No port, no banner — the platform owns the socket.
  return;
}

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
