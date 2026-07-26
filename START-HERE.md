# ▶️ START HERE — your full build playbook
*Open this and follow it top to bottom. This is the whole journey: accounts → build → SMS → live website.*

Mental model: **you set up accounts + test + decide; Claude Code writes the code.** You're the raid leader. 🎮

---

## PHASE 0 — Accounts first (≈30 min, do BEFORE opening Claude Code)
Make these free accounts and keep the keys in a notepad. Claude Code can't make them for you.

- ☐ **GitHub** — sign up (free). This stores your code + is your "save point" system.
- ☐ **Neon** (neon.com) — sign up → New Project → copy the **connection string** (starts with `postgresql://`). This is your database.
- ☐ **Semaphore** (semaphore.co) — sign up → copy your **API key** → load ~₱50 credits → **click "register Sender ID" NOW** (it takes 2–4 weeks to approve, so start the clock today).
- ☐ *(optional)* **Brevo** — free email sender, only if you want email reminders too.

> 💡 You do NOT need a credit card for any of these.

While you wait on nothing — also message your barangay contact to confirm: doctor sign-off on meds, can forms be digitized (control numbers/signatures), and 3 services vs +Consultation. (Doesn't block coding, but you'll need answers before the end.)

---

## PHASE 1 — Open Claude Code (5 min)
- ☐ Open **Claude Code** and point it at this folder: `clinic-system`.
- ☐ Paste this first (the **Kickoff**):

```
Read CLAUDE.md and everything in docs/ (PRD, ARCHITECTURE, DESIGN-SYSTEM, BUILD-PLAN, HOSTING).
Also look at db/schema.sql and the prototype in "design-reference/" — we want the app to match that look.
Do not write code yet. Summarize back: 1) the tech stack, 2) the folder structure, 3) the milestone order.
Then wait for my go-ahead.
```

- ☐ Read its summary. If it says Node + Express + EJS + Tailwind + Postgres → reply **"Go, start M0."**

---

## PHASE 2 — Build milestone by milestone (the main grind)
All the prompts are in **`docs/CLAUDE-CODE-PROMPTS.md`**. Paste them **one at a time, in order**. After each one:

1. **Run it** (Claude Code tells you how — usually `npm run dev` → open `localhost:3000`).
2. **Test the milestone's goal yourself** (does login work? can I add a patient? etc.).
3. **Save:** tell Claude Code *"commit this to GitHub with a clear message."*
4. Only then paste the **next** milestone.

The order + what each does:

- ☐ **M0 — Setup** → empty app runs + connects to your Neon DB. (Paste your Neon connection string when it asks; it goes in `.env`.)
- ☐ **M1 — Login & roles** → staff accounts. (Create your admin, log in.)
- ☐ **M2 — Patient records** → the EMR core (the tabbed patient screen).
- ☐ **M3 — Appointments** → scheduling + the auto daily list.
- ☐ **M4 — SMS + email reminders** → ⭐ your priority (full SMS steps in Phase 3 below).
- ☐ **M5 — Patient portal** → patients log in to see their own stuff.
- ☐ **M6 — Inventory** → medicine stock + doctor approval.
- ☐ **M7 — Reports** → attendance, no-shows, PDF export.
- ☐ **M8 — Polish + Deploy** → make it live (Phase 4 below).

> Don't skip ahead. Each milestone stacks on the last. If something breaks, paste the exact error to Claude Code.

---

## PHASE 3 — The SMS (happens during M4) ⭐
This is the part you were worried about. Order:

1. ☐ Make sure your **Semaphore API key** is in `.env` (Claude Code will wire it; never hardcode it).
2. ☐ Quick sanity test (optional, anytime): in the `clinic-system` folder run
   `node send-test-sms.js 09XXXXXXXXX "Hello from our clinic system"` → your phone should buzz.
3. ☐ During M4, tell Claude Code:
   *"Add a secret endpoint `GET /tasks/run-reminders?key=SECRET` that sends tomorrow's reminders, plus a 'Send reminder now' button for testing. Use the Semaphore key from .env. Don't start messages with the word TEST."*
4. ☐ Test the **"Send reminder now"** button → confirm your phone gets it and a row appears in the `notifications` table.

That's it — once a real text hits your phone, the scary part is **done**. The auto-daily part gets switched on at deploy (Phase 4) via cron-job.org.

---

## PHASE 4 — Make it live (during M8)
- ☐ Push everything to **GitHub** (Claude Code helps).
- ☐ **Neon** is already your DB (done in M0).
- ☐ **Render** (render.com) → New Web Service → connect your GitHub repo → paste your env vars (same as `.env`) → Deploy. You get a live `https://...onrender.com` link. 🎉
- ☐ **cron-job.org** → add a daily job (8 AM) that calls `https://your-app.onrender.com/tasks/run-reminders?key=YOUR_SECRET`. This is what makes reminders fire automatically.
- ☐ Open the live link on your **phone and laptop** → run through the whole flow.

---

## PHASE 5 — After it's live (Nov–Dec)
- ☐ Test it with the **actual clinic staff** (they're non-technical — watch where they get confused, fix those).
- ☐ Have Claude Code draft a **user manual** for staff.
- ☐ Screenshot everything + note your testing results → you'll need these for your final chapters + defense.

---

## 🔁 Habits that save you
- **Commit after every working milestone** (save points = you can undo disasters).
- **Test it yourself** before trusting "done."
- **Learn as you go:** ask Claude Code *"explain this file like I'm new to web dev."*
- **Specific feedback fixes things faster:** paste the exact error, or "X button does nothing, should do Y."

## If you get stuck (paste to Claude Code)
- `The app won't start — here's the error: <paste>`
- `<page> <element> does <wrong>, should <right>. Fix it and tell me what was wrong.`
- `Review the last milestone for security (roles, SQL injection, secrets) and fix issues.`

---
**TL;DR:** make 3 accounts (GitHub, Neon, Semaphore) → open Claude Code → paste Kickoff → paste M0…M8 one by one, testing + committing each → deploy to Render + cron-job.org → test with the clinic. Earlier > perfect. You got this, Gabo. 💪
