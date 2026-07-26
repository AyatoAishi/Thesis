# Architecture

## Stack (one language, fully online)
```
Browser (EJS pages + Tailwind)
        |  HTTPS
Express (Node.js)  ── routes ── middleware (auth/roles)
        |                         |
   pg (raw SQL)              services/ (sms, email, reminders-cron)
        |                         |
   PostgreSQL              Semaphore API / SMTP
```
- **Server-rendered** (EJS), not a single-page app. Each page is a normal URL the server renders.
- **node-cron** runs inside the same Express process for the daily reminder job.

## Folder structure (target)
```
server.js                 # boots Express, sessions, routes, starts cron
db/
  index.js                # pg Pool + query(sql, params) helper
  schema.sql              # tables (already written)
routes/
  auth.js                 # /login /logout
  patients.js             # /patients ...
  appointments.js         # /appointments ...
  inventory.js            # /inventory ...
  reports.js              # /reports ...
  portal.js               # /portal ... (patient-facing)
  admin.js                # /admin/users ...
views/
  layout.ejs              # shell: icon rail + topbar (from prototype)
  partials/               # queue, cards, modals, tabs
  patients/ appointments/ inventory/ reports/ portal/ auth/
public/
  css/app.css             # Tailwind build output
  js/                     # small client helpers (search, modals)
services/
  sms.js                  # sendSMS(), checkBalance()  (port of send-test-sms.js)
  email.js                # sendEmail()
  reminders.js            # cron job: build daily list -> send -> log
middleware/
  auth.js                 # requireLogin, requireRole('nurse','doctor',...)
```

## Routes / pages (first pass)
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET/POST | `/login`, `/logout` | all | Staff auth |
| GET | `/` (dashboard) | staff | Today's list + alerts |
| GET | `/patients` | staff | Search + list |
| GET/POST | `/patients/new` | nurse,facilitator,recorder | Register patient |
| GET | `/patients/:id` | staff | Profile + tabs |
| POST | `/patients/:id/vitals` (etc.) | staff | Add a record to a tab |
| GET/POST | `/appointments` | staff | List + create |
| GET | `/appointments/daily` | staff | Auto daily expected list |
| POST | `/appointments/:id/status` | staff | Mark completed/missed |
| GET/POST | `/inventory` | staff | Medicines + stock |
| POST | `/inventory/dispense` | staff | Dispense (may need doctor approval) |
| POST | `/inventory/dispense/:id/approve` | doctor | Approve a pending dispense |
| GET | `/reports` | nurse,recorder,admin | Attendance/no-show/seasonal |
| GET | `/reports/export/:type` | staff | PDF export |
| GET/POST | `/portal/register`, `/portal/login` | patient | Portal auth |
| GET | `/portal` | patient | Own appointments + permitted records |
| GET/POST | `/admin/users` | admin | Manage staff accounts |

## Data flow: the reminder system (M4)
```
node-cron fires daily (REMINDER_CRON, default 08:00)
  └─ query: appointments WHERE date = tomorrow AND status='scheduled'
       └─ for each patient:
            phone?         -> services/sms.js  -> Semaphore
            email opt-in?  -> services/email.js -> SMTP
            no contact?    -> family_contact_number (recipient_type='family')
            none at all?   -> add to manual follow-up list
       └─ insert a row into notifications (status sent/failed, provider id)
  └─ checkBalance(); if < LOW_CREDIT_ALERT -> email admin
```
**Reliability note:** this runs on the hosted server, so reminders for already-scheduled
appointments fire even if the clinic's WiFi is down. (See `../dev-starter/README-SMS.md`.)

## SMS (Semaphore) — confirmed API
- POST `https://api.semaphore.co/api/v4/messages` with form fields `apikey, number, message, sendername`.
- Returns a JSON array; each item has `message_id`, `status` (Queued→Pending→Sent), `network`.
- Balance: GET `https://api.semaphore.co/api/v4/account?apikey=...` → `credit_balance`.
- ⚠️ Messages starting with "TEST" are silently dropped.
- Working reference implementation: `send-test-sms.js`.

## Security
- Sessions via `express-session` (httpOnly cookie). bcrypt password hashes.
- `middleware/auth.js`: `requireLogin` + `requireRole(...roles)` on every protected route.
- Parameterized SQL only (never string-concat user input) — prevents SQL injection.
- Validate + sanitize all form input. Patients see only their own permitted data.

## Deployment
- App → Render or Railway (set env vars in the dashboard).
- DB → Neon or Supabase (managed Postgres). Run `schema.sql` once.
- Email → Brevo free tier. SMS → Semaphore prepaid credits.

## Hosting note (free tier)
Target free hosting = **Render + Neon** (see `docs/HOSTING.md`). The free app **sleeps when idle**, so
in-process `node-cron` may not fire on schedule. Recommended: expose a secret endpoint
`GET /tasks/run-reminders?key=...` and call it daily from an **external cron (cron-job.org)**. Keep the
`services/reminders.js` logic the same — just trigger it via the endpoint instead of (or alongside) node-cron.
