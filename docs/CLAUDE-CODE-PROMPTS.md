# Claude Code Prompts (copy-paste)

How to use: open this folder in Claude Code. Paste the **Kickoff** prompt once, then paste each
milestone prompt **one at a time**, in order. Wait for each to finish and confirm the AC before the next.

> Tip: after each milestone, run the app and click around. If something's off, tell Claude Code
> exactly what's wrong (the error text or "X button does nothing") — short, specific feedback works best.

---

## 🚀 Kickoff (paste first, once)
```
Read CLAUDE.md and everything in docs/ (PRD, ARCHITECTURE, DESIGN-SYSTEM, BUILD-PLAN).
Also look at db/schema.sql and the Claude Design prototype in "design-reference/"
(open the standalone HTML and styles.css) — we want the real app to match that look.

Do not write code yet. Summarize back to me:
1) the tech stack you'll use, 2) the folder structure you'll create, 3) the milestone order.
Then wait for my go-ahead.
```

---

## M0 — Setup
```
Do Milestone M0 in docs/BUILD-PLAN.md.
Scaffold the Express + EJS + Tailwind + pg project per CLAUDE.md's folder structure.
Set up db/index.js (pg pool), .env loading, sessions, and a layout.ejs shell (icon rail + topbar)
using the tokens in docs/DESIGN-SYSTEM.md. Load Plus Jakarta Sans + JetBrains Mono.
Give me a styled placeholder dashboard.
Stop at M0's acceptance criteria and tell me how to run it and how to run db/schema.sql.
```

## M1 — Auth & Roles
```
Do Milestone M1. Add session-based staff login/logout with bcrypt, role middleware
(requireLogin, requireRole), a seed script for one admin user, and /admin/users for managing staff.
Wire the topbar user chip + logout. Follow the routes table in docs/ARCHITECTURE.md.
Meet M1's acceptance criteria, then stop and tell me how to create the admin and log in.
```

## M2 — Patient Records
```
Do Milestone M2. Build patient registration (auto patient_number, minor/guardian + family-contact
fields), the patient list + search (name or number), and the tabbed profile
(Overview, Vitals, Immunization, Prenatal, Medications, Visit History) matching the prototype.
Each tab gets an "Add New Record" modal that inserts into the correct table from db/schema.sql.
Meet M2's AC, then stop.
```

## M3 — Appointments & Daily List
```
Do Milestone M3. Add appointment create/reschedule/cancel, the auto daily expected list
(/appointments/daily), and attendance status (completed/missed/cancelled). Show today's list on the dashboard.
Meet M3's AC, then stop.
```

## M4 — Notifications (SMS + Email)
```
Do Milestone M4. Create services/sms.js (port send-test-sms.js — same Semaphore endpoint and the
no-"TEST" rule), services/email.js (Nodemailer), and services/reminders.js (node-cron daily job)
with the channel fallback logic in docs/ARCHITECTURE.md, logging every send to the notifications table.
Add a "Send reminder now" button for manual testing and a low-credit admin alert.
Meet M4's AC. Important: don't hardcode the API key — read from .env.
```

## M5 — Patient Portal
```
Do Milestone M5. Build the patient portal: self-registration (basic info + valid ID -> patient_accounts,
is_verified=false), staff verification, separate portal login + password recovery via recovery_id,
and a portal home showing ONLY the patient's own next appointment, reminders, and clinic-permitted records.
Enforce that patients cannot reach any staff route. Meet M5's AC, then stop.
```

## M6 — Inventory
```
Do Milestone M6. Build medicine inventory: CRUD, stock levels, low-stock flagging, and dispensing
that subtracts from stock and records to medicine_dispenses. If requires_doctor_approval is true,
keep the dispense pending until a doctor user approves it. Meet M6's AC, then stop.
```

## M7 — Reports & Export
```
Do Milestone M7. Build reports: attendance summary, a filterable/searchable no-show list,
seasonal-case trend, and inventory report with date ranges. Add PDF export of a patient record/form
(server-side). Charts (Chart.js) optional. Meet M7's AC, then stop.
```

## M8 — Polish & Deploy
```
Do Milestone M8. Do a UI/UX + mobile-responsive pass, add input validation + friendly error/empty
states everywhere, seed realistic demo data (use shapes from "design-reference/data.js"),
and give me step-by-step instructions to deploy the app to Render (or Railway) with a Neon/Supabase
Postgres. Then draft a short staff user manual. Meet M8's AC.
```

---

## Handy follow-up prompts (anytime)
```
The app won't start — here's the error: <paste error>
```
```
On <page>, <element> does <wrong thing>; it should <expected>. Fix it and tell me what was wrong.
```
```
Before adding features, review the last milestone for security (roles, SQL injection, secrets) and fix issues.
```
```
Explain what this file does in simple terms, like I'm new to web dev. <filename>
```
```
Write a few basic tests for <module> so we don't break it later.
```

## Hosting note (read before M4 & M8)
We host FREE on **Render + Neon** (not InfinityFree). The free app sleeps, so for reminders tell Claude Code:
"Add a secret endpoint `GET /tasks/run-reminders?key=SECRET` that runs the reminder job; we'll call it daily
from cron-job.org instead of relying on in-process node-cron." See `docs/HOSTING.md`.
