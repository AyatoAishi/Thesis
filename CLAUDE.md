# CLAUDE.md — Project context for Claude Code

> Read this file first. It is the source of truth for HOW to build this project.
> Detailed specs live in `docs/`. The visual design lives in the sibling folder
> `design-reference/` (a Claude Design React prototype) and is summarized
> in `docs/DESIGN-SYSTEM.md`.

## What we're building
A **Web-Based Electronic Medical Record (EMR) + Appointment Management System** for
**Barangay Sampaguita Health Clinic** (a small community health clinic in the Philippines).
It is an undergraduate thesis project (BS Information Technology). End users are
**non-technical** clinic staff (a nurse, facilitators, a recorder, and a visiting doctor)
plus **patients** who use a limited self-service portal.

The system must: centralize patient records, track appointments and auto-generate a daily
list of expected patients, send SMS/email reminders (with a family-contact fallback),
manage a medicine inventory (with doctor approval on dispensing), provide a patient portal,
and produce reports (attendance, no-shows, seasonal cases). It runs **fully online**.

## Tech stack (LOCKED — do not substitute without asking)
- **Runtime/Backend:** Node.js (v18+) + **Express**
- **Views:** server-rendered **EJS** templates + **Tailwind CSS** (utility classes)
- **Database:** **PostgreSQL** (use the `pg` library; raw SQL in a `db/` module, no heavy ORM)
- **Auth:** session-based (`express-session`), passwords hashed with **bcrypt**
- **SMS:** Semaphore HTTP API (see `send-test-sms.js` and `docs/ARCHITECTURE.md`)
- **Email:** Nodemailer (SMTP) — Brevo or Gmail free tier
- **Scheduler:** `node-cron` for the daily reminder job
- **Hosting target:** Render/Railway (app) + Neon/Supabase (Postgres)

Keep it ONE language (JavaScript) end-to-end. Do **not** add PHP, React SPA, or a second
backend. The panel explicitly warned against mixing stacks. Simple > clever.

## Target folder structure
```
clinic-system/
  CLAUDE.md            ← this file
  README.md
  .env.example         ← copy to .env and fill in
  package.json
  server.js            ← app entry (Express)
  db/
    schema.sql         ← run this to create tables (already written)
    index.js           ← pg connection pool + query helper
  routes/              ← one file per module (auth, patients, appointments, ...)
  views/               ← EJS templates (layout + pages + partials)
  public/              ← compiled CSS, client JS, images
  services/
    sms.js             ← Semaphore wrapper (from send-test-sms.js)
    email.js           ← Nodemailer wrapper
    reminders.js       ← the node-cron daily job
  middleware/
    auth.js            ← requireLogin, requireRole(...)
  docs/                ← PRD, ARCHITECTURE, DESIGN-SYSTEM, BUILD-PLAN, prompts
```

## How to run (once built)
```bash
npm install
cp .env.example .env      # then fill in real values
psql "$DATABASE_URL" -f db/schema.sql   # create tables
npm run dev               # start the server (nodemon)
```

## Non-negotiable rules
1. **Security/Data Privacy Act (RA 10173):** never store plaintext passwords (bcrypt only);
   never log full patient records; restrict every route with role checks.
2. **Roles:** `nurse`, `facilitator`, `recorder`, `doctor`, `admin` (staff) + `patient` (portal,
   view-only of their own permitted records). Enforce via `middleware/auth.js`.
3. **Minors:** patient records flagged `is_minor` require `guardian_consent`; treat with extra care.
4. **Medicine dispensing:** if `requires_doctor_approval` is true, a dispense is not final until a
   `doctor` user approves it (sets `approved_by`/`approved_at`).
5. **SMS gotcha:** never send a message that starts with the word "TEST" — Semaphore silently drops it.
6. **Secrets:** only via `.env`; never hardcode API keys; never commit `.env`.
7. **Build incrementally:** follow `docs/BUILD-PLAN.md` milestone by milestone. After each ticket,
   make sure the app still runs before moving on.

## Design
Match the look of the Claude Design prototype in `design-reference/`. The exact tokens
(colors, fonts, radii, spacing, shadows) and screen inventory are in `docs/DESIGN-SYSTEM.md`.
Primary font **Plus Jakarta Sans**, mono **JetBrains Mono**, accent **#3b6cf5**.

## Where to look
- Requirements & features → `docs/PRD.md`
- Stack, routes, data flow → `docs/ARCHITECTURE.md`
- Colors/fonts/screens → `docs/DESIGN-SYSTEM.md`
- The ordered build tasks → `docs/BUILD-PLAN.md`
- Copy-paste prompts → `docs/CLAUDE-CODE-PROMPTS.md`
- Database tables → `db/schema.sql`
- Hosting/deploy (FREE) → `docs/HOSTING.md`

## Hosting decision (FREE — important)
Host on **Render (app) + Neon (Postgres)** — both free, no credit card. **Do NOT use InfinityFree**
(its free tier has no Node.js, no cron, no outbound email). Because the free host sleeps when idle,
fire the daily reminders from a **secret endpoint called by an external cron (cron-job.org)** rather than
relying only on in-process node-cron. Full details + why in `docs/HOSTING.md`.
