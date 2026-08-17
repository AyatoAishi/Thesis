# System Overview — Sampaguita Health Clinic EMR + Appointments

A plain-language explanation of what this system is, what it's built with, and why — written so you
can answer "so what did you actually build?" confidently, whether it's a professor, a panelist, or a
curious teammate asking.

---

## What this is, in one paragraph

A web-based system for Barangay Sampaguita Health Clinic that replaces paper-based patient records
and appointment logs. Staff register patients, book and track appointments across the clinic's 3
fixed service days, get automatic email reminders sent out, manage a medicine inventory with a
doctor-approval step for controlled medicines, and pull reports on attendance/no-shows/trends/
inventory. Patients get their own limited self-service login to see their next appointment and book
their own visits. It's currently live at `https://sampaguita-clinic.onrender.com`.

---

## The tech stack, and *why* each piece was chosen

| Layer | Choice | Why |
|---|---|---|
| Server / backend | **Node.js + Express** | One language (JavaScript) for the whole backend, huge community and documentation, straightforward to build solo on a thesis timeline. |
| Pages / frontend | **EJS (server-rendered HTML) + Tailwind CSS** | The server builds complete HTML pages directly — no separate frontend framework (like React) to build, build-tool, and keep in sync with a separate API. Simpler mental model for a small internal tool used by a handful of staff. |
| Database | **PostgreSQL**, hosted free on **Neon** | A real relational database — patients, appointments, medicines, and dispenses are all separate tables *linked together* by ID (a foreign key), so e.g. an appointment always points to a real, existing patient. This is the right tool for data with real relationships, as opposed to a spreadsheet or a single flat collection. Neon specifically because it's a legitimately free, no-credit-card-needed managed Postgres host. |
| Passwords | **bcryptjs** | A one-way hashing algorithm — the system can *check* a password is correct without ever storing (or being able to recover) the real password. `bcryptjs` specifically (a pure-JavaScript version) instead of native `bcrypt`, to avoid needing extra build tools on Windows during development. |
| Email | **Nodemailer + Gmail SMTP** | Free email sending using a dedicated Gmail account and an App Password (a generated code just for this app — not the real account password). |
| SMS | **Semaphore** (planned, not active) | The originally planned provider; not turned on yet because the minimum upfront credit purchase (~₱2,800) wasn't affordable for a thesis budget. The system is fully built to support it — turning it on later needs zero code changes, just adding the account's API key. |
| PDF generation | **PDFKit** | Generates the printable patient-record PDF directly on the server — no external service needed. |
| Hosting | **Render** (free tier) | Free, no credit card, supports Node.js + scheduled jobs + outbound email — unlike some free hosts (e.g. InfinityFree) which block exactly those things. |
| Daily automation | **cron-job.org** (free) | Render's free tier sleeps when idle, so an external free service pings the site daily to reliably trigger the reminder job even if nothing else has touched the site recently. |
| Version control | **Git + GitHub** | Full history of every change, and it's what Render deploys from directly. |

---

## How the data is organized (the database, briefly)

Everything lives in one PostgreSQL database with about 10 tables. The core ones:
- **users** — staff accounts + their role (nurse, facilitator, recorder, doctor, admin)
- **patients** — demographics, contact info, family contact, minor/guardian info
- **patient_accounts** — the *separate* patient portal login (not the same table as staff)
- **services** — the 3 fixed clinic services and which weekday each runs on
- **appointments** — links a patient + a service + a date + a status
- **medicines** / **medicine_dispenses** — stock levels and who received what, including the pending
  doctor-approval state
- **visits** — the consultation record: vital signs (BP, weight, height, temperature), the
  diagnosis, the clinician's notes, who attended, and the doctor present if any. This is what
  Chapter 1 calls "recorded vital signs" and "diagnoses and consultation notes"
- **notifications** — a log of every reminder/confirmation attempt, sent or failed

Every table that matters is connected by ID references, not duplicated data — e.g. an appointment
doesn't repeat the patient's name, it just points at their one row in `patients`.

---

## Security & privacy (RA 10173 relevant points)

- Passwords are bcrypt-hashed, never stored or logged in plain text.
- Login and patient-portal-signup failures show **generic error messages** — the system never
  reveals whether a specific username/patient number exists, to prevent someone from fishing for
  real accounts.
- Every patient-portal page checks *who is logged in* (from the session), never trusting an ID typed
  into the URL — a patient cannot view another patient's data by guessing a different number.
- Minors require a recorded guardian name **and** an explicit consent checkbox before their record
  can even be saved — not optional, enforced by the registration form itself.
- Role-based access: some pages (reports, medicine-approval) are restricted to specific staff roles.
- Session cookies are `httpOnly` (JavaScript on the page can't read them) and `secure` (only sent over
  an encrypted connection).

---

## Known limitations (good to be upfront about)

- **SMS is not live** — built and ready, but inactive until an affordable provider is arranged.
- **Free-tier hosting** — Render's free plan sleeps after 15 minutes of no traffic; a "keep-alive"
  ping every 10 minutes works around this, but it's still a free-tier constraint worth naming if asked.
- **No rate limit on sign-in attempts** — passwords can be tried repeatedly without the system
  slowing anyone down. Temporary passwords are 8 mixed-case characters (~46 bits), so guessing one
  over a network is not realistic, but this is the honest gap to name if asked about brute force.
- **No CSRF protection** — forms don't carry a one-time token. Session cookies are `SameSite=Lax`,
  which blocks the ordinary cross-site POST, but a token is what a security review would expect.
- **Patient portal sign-ins aren't in the audit log** — staff logins, patient record changes and
  role changes are all recorded; portal logins are not yet.
- **Single environment** — one database, no separate "testing" vs "live" copy. Fine for a project
  this size, but worth knowing if asked about scalability.

---

## Likely questions and honest answers

**"Why Postgres and not MySQL / Firebase / Google Sheets?"**
The data has real relationships (a patient has many appointments, a medicine has many dispenses) —
a relational database enforces those links correctly (you can't create an appointment for a patient
that doesn't exist). Firebase/Sheets can work for simple lists, but don't naturally express or
enforce relationships like that.

**"Why not a mobile app?"**
A web app works on any device with a browser — staff and patients don't need to install anything,
and it's easier to maintain one codebase than a website plus separate iOS/Android apps.

**"How do you know this is secure?"**
Passwords are hashed, not stored in plain text; sessions are scoped to the logged-in user, not a URL
parameter; login/signup never reveals whether an account exists; minors require explicit recorded
consent. These map directly to Data Privacy Act (RA 10173) concerns around unauthorized access and
informed consent.

**"What happens if the free hosting breaks or goes down?"**
The code and database are independent of the specific host — Render and Neon were chosen because
they're free and reliable, but the system could be redeployed to another Node-compatible host
(Railway, Fly.io, etc.) with no code changes, just re-pointing the same environment variables.

**"Did you use AI to help build this?"**
Yes — this was built with Claude Code as a development tool, the same way a developer might use an
IDE, documentation, or pair programming. Every milestone was planned first (see `docs/BUILD-PLAN.md`),
built, then **tested end-to-end before moving on** — every feature in this system has been personally
verified working, including edge cases like what happens with no stock, no appointments, or an
unverified account. Knowing *what* the system does, *why* it's built that way, and being able to
explain and defend those decisions is what matters for a thesis defense — not which tool typed the
code.

**"What was the hardest part / most interesting design decision?"**
Two good examples: (1) medicine dispensing was designed so stock is only ever deducted the moment a
dispense is *truly final* — either immediately, or the instant a doctor approves it — so the shelf
count can never drift out of sync with what a pending, not-yet-approved request implies. (2) The
patient portal's identity verification deliberately gives *generic* error messages on a failed
signup match, so the system can't be used to check whether a specific patient number or name exists
in the clinic's records.
