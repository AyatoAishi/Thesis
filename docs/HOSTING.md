# Hosting & Deployment (FREE)

**Decision:** host free on **Render** (the app) + **Neon** (the database). No credit card needed.
**Do not use InfinityFree** for this app — reasons below.

## TL;DR
| Need | Use | Free? | Notes |
|---|---|---|---|
| App (Node/Express) | **Render** web service | ✅ no card | Sleeps after 15 min idle, wakes in ~1 min. 750 hrs/mo. |
| Database (Postgres) | **Neon** | ✅ no card | 0.5 GB, doesn't expire — plenty for a clinic thesis. |
| Daily reminders | **cron-job.org** | ✅ | Pings your app daily to send reminders (see the gotcha below). |
| SMS | **Semaphore** | 💸 pay per SMS | ~₱0.50 each; ~₱100/mo for your volume. Only real cost. |
| Email (optional) | **Brevo** | ✅ 300/day | HTTPS API works from Render. |

**Total hosting cost: ₱0.** Only SMS credits cost a little, which is unavoidable for any SMS feature.

## Why NOT InfinityFree (verified)
Your classmate's suggestion is fine for a plain PHP/WordPress site, but InfinityFree's **free tier**:
- ❌ **No Node.js** (PHP + MySQL only; Node is paid-only).
- ❌ **No cron jobs** (disabled since 2023).
- ❌ **No outbound email** (`mail()` disabled, SMTP blocked).

Your system's main feature is an **automated daily reminder** (a scheduled job that sends SMS/email).
That needs a backend + cron + outbound connections — exactly what InfinityFree blocks. Wrong tool for
*this* job, that's all.

## ⚠️ The one gotcha on free hosting: the app "sleeps"
Render's free app sleeps when idle. A normal in-app timer (`node-cron`) **won't fire at 8 AM if the
app is asleep.** The clean, free fix (works on any free host):

1. Build a **secret endpoint** in the app, e.g. `GET /tasks/run-reminders?key=YOUR_SECRET`
   that runs the "send tomorrow's reminders" job.
2. Sign up at **cron-job.org** (free) and add a job that calls that URL **every day at 8 AM**.
3. That daily request **wakes the app AND fires the reminders.** Reliable and free.

> Tell Claude Code: *"Trigger reminders via a secret endpoint called by an external cron (cron-job.org),
> not in-process node-cron, because the free host sleeps. Protect the endpoint with a secret key from .env."*

## Deploy steps (M8 — the app is done, this is what's left)

### 1. Push the repo to GitHub
The project is already a local git repo with one commit. Create an empty repo on
**github.com** (no README/license — you already have files), then:
```
git remote add origin <your-repo-url>
git push -u origin master
```

### 2. Database — already done, nothing new to create
You've been using a **Neon** Postgres database since M0 — reuse that exact same
`DATABASE_URL`. No second/production database needed for a project this size.
It already has the schema applied and (optionally) the demo data from
`npm run seed:demo`.

### 3. Render → New Web Service
Connect your GitHub repo, then set:
| Setting | Value |
|---|---|
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |
| **Node version** | 18+ (matches `engines` in package.json) |

> ⚠️ **Don't just use `npm install`** as the build command — the CSS (`public/css/app.css`)
> is a build artifact that isn't committed to git, so it must be generated during the
> Render build via `npm run build`, or the deployed site will load with no styling.

Then add these **environment variables** (same keys as your local `.env`):
| Key | Value |
|---|---|
| `DATABASE_URL` | your Neon connection string (from step 2) |
| `SESSION_SECRET` | a long random string (**not** the placeholder — generate a new one) |
| `NODE_ENV` | `production` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | same as local — your Gmail App Password setup |
| `REMINDER_CRON`, `REMINDER_LEAD_DAYS` | same as local (defaults: `0 8 * * *`, `1`) |
| `CRON_SECRET` | a long random token (**not** the placeholder) — this guards `/tasks/run-reminders` |
| `SEMAPHORE_API_KEY`, `SEMAPHORE_SENDER` | leave blank until an SMS provider is chosen |
| `LOW_CREDIT_ALERT` | `100` (unused until SMS is live, harmless either way) |

Deploy. You get a live `https://your-app.onrender.com` URL.

### 4. cron-job.org → the daily reminder trigger
Free account → add a job that calls
`https://your-app.onrender.com/tasks/run-reminders?token=YOUR_CRON_SECRET`
once a day around 8 AM Asia/Manila time. This is what makes reminders fire even
while Render's free tier has the app asleep.

### 5. First login on the live site
The `users` table already has your real `admin` account (and demo staff, if you ran
`npm run seed:demo`) — it's the same Neon database, so nothing needs re-seeding.
Log in with your existing admin credentials and change the password if you haven't.

### 6. Test the full flow — on a phone AND a laptop
Open the live URL on both. Register a patient, book an appointment, mark it done,
dispense a medicine, open a report, export a PDF, and try the patient portal
(`/portal`). This is exactly what M8's acceptance criteria asks for.

## If Render ever doesn't fit
Swap pieces, keep the code: app → Railway / Fly.io / Koyeb; database → Supabase instead of Neon.
Only env vars and deploy steps change.
