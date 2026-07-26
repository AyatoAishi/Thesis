# Sampaguita Clinic — EMR + Appointment System

Thesis project (Group 7, BS IT). A fully-online web app for Barangay Sampaguita Health Clinic:
patient records, appointment tracking + daily list, SMS/email reminders, medicine inventory,
patient portal, and reports.

## 🟢 Start here (for the team)
You are going to build this with **Claude Code**. The whole plan is already prepared:

1. Open this folder in Claude Code.
2. Tell it: **"Read CLAUDE.md and docs/, then start Milestone 0 in docs/BUILD-PLAN.md."**
3. Or copy-paste the ready-made prompts from **`docs/CLAUDE-CODE-PROMPTS.md`**, one milestone at a time.
4. Build in order. Don't skip ahead — each milestone depends on the previous one.

## 📁 What's inside
| File / folder | What it is |
|---|---|
| `CLAUDE.md` | The rules + stack Claude Code must follow |
| `docs/PRD.md` | What we're building (features, roles, user stories) |
| `docs/ARCHITECTURE.md` | Stack, folder layout, routes, SMS/email/cron flow |
| `docs/DESIGN-SYSTEM.md` | Colors, fonts, screens (matches the Claude Design prototype) |
| `docs/BUILD-PLAN.md` | The full workload — milestones & tickets, in order |
| `docs/CLAUDE-CODE-PROMPTS.md` | Copy-paste prompts for each milestone |
| `db/schema.sql` | The PostgreSQL database (ready to run) |
| `send-test-sms.js` | A working SMS test (prove the SMS works first) |

## ⚙️ First-time setup (do once, before Milestone 1)
1. Make a free PostgreSQL DB (Neon or Supabase) → copy its connection string.
2. Make a Semaphore account → get API key + **start sender-ID registration (2–4 week wait!)**.
3. `cp .env.example .env` and fill in the values.
4. Test SMS now: `node send-test-sms.js 09XXXXXXXXX "Hello from our clinic system"`.

## 🗓️ Timeline
~6 months (June → December 2026). See the phase table in `../System_Development_Roadmap.md`.

## 👥 Team
Villardo (head dev), Actub (system/SMS), Bonda (front-end + docs), Gonzales (requirements + docs).
Everyone should be able to run and test it — not just one person.

## Hosting (free)
Free stack: **Render** (app) + **Neon** (Postgres) + **cron-job.org** (daily reminder trigger). No credit card.
Not InfinityFree — it can't run Node/cron/email. See `docs/HOSTING.md`.
