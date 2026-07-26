# Build Plan — the workload

Build in order. Each milestone = one focused Claude Code session. Don't start a milestone until the
previous one runs without errors. Copy-paste prompts for each are in `CLAUDE-CODE-PROMPTS.md`.

Legend: ☐ = ticket to do · **AC** = acceptance criteria (how you know it's done).

---

## M0 — Project setup *(do first)*
**Goal:** an empty but running Express app.
- ☐ `npm init`; install express, ejs, pg, express-session, bcrypt, nodemailer, node-cron, dotenv; dev: nodemon, tailwindcss.
- ☐ `server.js` with Express, EJS view engine, static `public/`, session, `.env` loading.
- ☐ Tailwind set up → `public/css/app.css` build; load Plus Jakarta Sans + JetBrains Mono.
- ☐ `db/index.js` (pg Pool + `query()` helper). Run `db/schema.sql` against the DB.
- ☐ `views/layout.ejs` shell (icon rail + topbar) using DESIGN-SYSTEM tokens.

**AC:** `npm run dev` serves a styled placeholder dashboard; DB connection confirmed; no console errors.

---

## M1 — Authentication & Roles
**Goal:** staff can log in; routes are role-protected.
- ☐ `middleware/auth.js`: `requireLogin`, `requireRole(...roles)`.
- ☐ `routes/auth.js`: GET/POST `/login`, `/logout` (bcrypt compare, session).
- ☐ Seed script: create one `admin` user.
- ☐ `routes/admin.js`: `/admin/users` — admin creates/disables staff + sets role.
- ☐ Topbar user chip shows the logged-in user + role; logout works.

**AC:** wrong password rejected; logged-in staff reach the dashboard; a non-admin hitting `/admin/users` is blocked.

---

## M2 — Patient Records (EMR core)
**Goal:** register and view patients with the tabbed record.
- ☐ `routes/patients.js`: list + search (by name or patient_number).
- ☐ Register patient form → auto-generate `patient_number` (e.g. `SHC-2026-0001`); minor/guardian + family-contact fields.
- ☐ Patient profile page with tabs: Overview, Vitals, Immunization, Prenatal, Medications, Visit History (match prototype).
- ☐ "Add New Record" modal per tab → insert into the right table (`visits`, `immunization_records`, etc.).
- ☐ Instant search in topbar.

**AC:** can register a patient, open their profile, add a vitals + immunization + visit record, and find them by name/number.

---

## M3 — Appointments & Daily List
**Goal:** schedule appointments and auto-build the daily expected list.
- ☐ `routes/appointments.js`: create / reschedule / cancel (patient + service + date).
- ☐ `/appointments/daily`: list of patients expected today/tomorrow per service (uses the date+status index).
- ☐ Mark attendance: scheduled → completed | missed | cancelled.
- ☐ Dashboard shows today's count + list.

**AC:** create an appointment for tomorrow → it appears in the daily list; marking it "completed"/"missed" updates the record.

---

## M4 — Notifications (SMS + Email)  *(your priority area)*
**Goal:** automatic reminders with fallback + logging.
- ☐ `services/sms.js`: port `send-test-sms.js` (sendSMS, checkBalance).
- ☐ `services/email.js`: Nodemailer sendEmail.
- ☐ `services/reminders.js`: node-cron job → query tomorrow's list → send per channel logic (phone→SMS, email opt-in→email, else family fallback, else manual list) → insert into `notifications`.
- ☐ "Send reminder now" button on an appointment (manual trigger for testing).
- ☐ Low-credit alert to admin when balance < `LOW_CREDIT_ALERT`.

**AC:** manual send delivers to your phone and writes a `notifications` row; cron is scheduled; a patient with no phone uses the family number; logs show sent/failed.

---

## M5 — Patient Portal
**Goal:** patients log in to a limited, view-only portal.
- ☐ `routes/portal.js`: register (basic info + valid ID) → `patient_accounts` (is_verified=false); staff verifies.
- ☐ Portal login (separate from staff) + password recovery via `recovery_id`.
- ☐ Portal home: own next appointment + reminders + ONLY clinic-permitted records.

**AC:** a verified patient logs in and sees only their own permitted data; cannot reach any staff route or another patient's data.

---

## M6 — Medicine Inventory
**Goal:** stock tracking + dispensing with doctor approval.
- ☐ `routes/inventory.js`: medicines CRUD, stock levels, low-stock flag (< threshold).
- ☐ Dispense (patient + medicine + qty) → subtract from `stock_quantity`; record in `medicine_dispenses`.
- ☐ If `requires_doctor_approval`: dispense is pending until a `doctor` approves (`approved_by`/`approved_at`).

**AC:** dispensing reduces stock; low stock is flagged; an approval-required dispense stays pending until a doctor approves it.

---

## M7 — Reports & Export
**Goal:** the analytics + printable hard copies.
- ☐ `routes/reports.js`: attendance summary, **no-show list** (filter/search), seasonal-case trend, inventory report; date ranges.
- ☐ Optional Chart.js visuals; filterable tables are the must-have.
- ☐ PDF export of a patient record / standard form (server-side PDF).

**AC:** reports render for a chosen range; no-show list is filterable; a record exports to a clean PDF.

---

## M8 — Polish, Test & Deploy
**Goal:** ship it.
- ☐ UI/UX pass: consistent design, mobile-responsive, friendly empty/error states (non-technical users!).
- ☐ Input validation + error handling across all forms.
- ☐ Seed realistic demo data (use shapes from prototype `data.js`).
- ☐ Deploy: app → Render/Railway, DB → Neon/Supabase, env vars set; run `schema.sql`.
- ☐ Write a short user manual for clinic staff.

**AC:** a live URL where staff can log in and run the full flow on a phone and a laptop.

---

## Suggested calendar (≈6 months)
| Month | Milestones |
|---|---|
| July | M0, M1 |
| August | M2 |
| September | M3, M4 |
| October | M5, M6 |
| November | M7 + UI polish |
| December | M8 (test with clinic, deploy, manual) + buffer |

## Before you start coding — confirm with the barangay
Doctor sign-off on meds · permission to digitize forms (control numbers / signatures) ·
notification channels · which services (3 vs +Consultation). See PRD §4.

## Hosting (decided): FREE — Render + Neon
Deploy in M8 to **Render (app) + Neon (Postgres)** — free, no credit card. **Not InfinityFree** (no Node/cron/email).
Reminders fire via a secret endpoint hit daily by **cron-job.org** (free), because the free host sleeps. See `docs/HOSTING.md`.
