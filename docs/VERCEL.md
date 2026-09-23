# Moving to Vercel — checklist

**Why:** PLDT cannot route to Render's IP range. Confirmed on three PLDT connections, working on Converge and DITO, and reported publicly by other people. The system is up; a large part of the country cannot reach it.

**The code is already done and pushed** (`5618220`): `api/index.js`, `vercel.json`, and `server.js` exporting the app. Nothing below touches code.

---

## Before you start

Have `.env` open in Notepad. You will copy values out of it. **Copy them straight into Vercel — they do not need to pass through anybody else.**

---

## 1. Import the project

1. `vercel.com` → **Log in** → **Continue with GitHub**
2. **Add New → Project**
3. Find `AyatoAishi/Thesis` → **Import**
4. Framework Preset: leave as **Other**. Do not let it guess Next.js.
5. **Do not press Deploy yet.**

## 2. Environment variables

Expand **Environment Variables** and add each of these, copying the value from `.env`:

| Name | Notes |
|---|---|
| `DATABASE_URL` | **See §3. This one is not a straight copy.** |
| `SESSION_SECRET` | Straight copy |
| `CRON_SECRET` | Straight copy — cron-job.org already uses this value |
| `BREVO_API_KEY` | **Not in local `.env`.** Copy it from Render's env vars, or from Brevo. |
| `MAIL_FROM` | Straight copy |
| `PHILSMS_TOKEN` | Straight copy |
| `PHILSMS_SENDER` | `PhilSMS` |
| `REMINDER_CRON` | Straight copy |
| `NODE_ENV` | `production` |

`PORT` is **not** needed. Vercel owns the port.

## 3. DATABASE_URL — the one that bites

It must be Neon's **pooled** connection string. The host has `-pooler` in it:

```
postgresql://USER:PASS@ep-xxxxx-pooler.REGION.aws.neon.tech/DB?sslmode=require
                              ^^^^^^^
```

Get it from `console.neon.tech` → your project → **Connection string** → tick **Pooled connection**.

**Why this matters and why it is easy to miss:** Vercel runs one function per request and each cold one builds its own connection pool. Without the pooler, many small pools appear under load and exhaust Neon's connection limit. With one person clicking around it looks perfect. It falls over when several people use it at once — which is to say, in front of an audience.

## 4. Deploy

Press **Deploy**. Two to three minutes.

You get a URL like `sampaguita-clinic.vercel.app`.

## 5. Check these, in this order

1. **Open it on PLDT.** If this fails, stop — the move solved nothing and Render is no worse.
2. `/login` — the page renders **with styling**. No styling means the Tailwind build did not run; check the build log for `npm run build`.
3. Sign in as admin. A failure here is almost always `DATABASE_URL`.
4. `/dashboard` — the calendar shows, and pressing a day changes the list below.
5. `/patients` — 22 patients listed.
6. `/privacy` — loads without signing in.
7. Add a `ZZ Test` patient, then delete it. This proves writes and CSRF work.
8. `/inventory` → open a medicine → **Archive** → **Ibalik sa listahan**.

## 6. Afterwards

- **Point cron-job.org at the new URL.** `https://<new-url>/tasks/run-reminders?token=<CRON_SECRET>`. Miss this and reminders stop silently — nothing will report an error, patients just stop being told about their appointments.
- **Leave Render running.** It costs nothing, it works for Converge and DITO, and a second working address is worth more than a tidy account.
- Update the URL in `docs/OPERATIONS.md` and wherever else it is written down.

## If it goes wrong

Everything is recoverable. The code still runs on Render unchanged, the database was never touched, and `git tag working-state-2026-09-22` is the state before any of this.

The demo does not depend on any of it: `npm run dev` and `localhost:3000` work on PLDT, because PLDT can reach Neon fine — it is only Render it cannot route to.
