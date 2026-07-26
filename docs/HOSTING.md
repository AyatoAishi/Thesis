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

## Deploy steps (do these at Milestone M8)
1. Push the repo to **GitHub** (free).
2. **Neon** → create a project → copy the connection string → run `db/schema.sql` against it.
3. **Render** → New Web Service → connect your GitHub repo → add env vars (same keys as `.env`) → deploy.
   You get a live `https://...onrender.com` URL.
4. **cron-job.org** → add the daily job hitting `/tasks/run-reminders?key=...`.
5. Test the full flow on the live URL — on a **phone and a laptop**.

## If Render ever doesn't fit
Swap pieces, keep the code: app → Railway / Fly.io / Koyeb; database → Supabase instead of Neon.
Only env vars and deploy steps change.
