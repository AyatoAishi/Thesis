# Operations and Support

**"Ano daw gagawin pag nagkaron ng error sa system? Kailangan ba daw tatawagan tayo ng staff ng clinic?"** — Niel, and the reason this file exists. It is a deployment question, the panel is likely to ask it, and "we will fix it" is not an answer because it does not survive graduation.

Two things this document refuses to pretend:

- We are not a help desk. There is no rota, no ticket queue, and no promise of a response time. Saying otherwise in a defense creates an obligation nobody in the group can keep past this semester.
- Most of what a clinic will call an "error" is not a bug. It is a forgotten password, a slow first page load, or a day with no appointments on it. Those have answers the staff can reach without us, and separating them from real faults is most of the value here.

---

## 1. What the staff should do, in order

This is the part to put on paper and tape beside the computer.

**Step 1 — Read what it says.** The system tries to answer in the message rather than in a code. "Only 12 tablet(s) of Metformin left in stock" is not a fault; it is the system refusing something impossible.

**Step 2 — Ask Ate Sam.** The `Tulong` button, bottom right of every page. 31 answers for staff, 7 for patients, no internet needed. Roughly every second question the clinic will have is in there: how to add a patient, where immunization lives, why a booking will not save.

**Step 3 — Refresh, then sign out and back in.** This clears the two most common non-faults: a page left open past the 8-hour session, and a form that expired while it sat there ("Form expired" is exactly this).

**Step 4 — Wait one minute and try once more.** The hosting sleeps when unused. The first page load after a quiet spell takes a few seconds, and a timeout on the very first try is usually this, not a breakage.

**Step 5 — Write it down and tell the group.** What page, what was pressed, what it said, and roughly when. A screenshot beats a description. Without the time and the page, a fault cannot be found in the activity log.

Nothing above needs a developer, and steps 1–4 resolve the ordinary cases.

---

## 2. What the staff should never do

- **Do not re-enter a patient because the first save "did not work."** Check the patient list first. A duplicate record splits one person's history across two files and nothing joins it back up.
- **Do not share a login.** The activity log records who did what, and a shared account makes every line of it a guess.
- **Do not dispense from memory when the stock number looks wrong.** Recount the shelf, correct the stock, then dispense — otherwise the count and the shelf drift apart permanently.

---

## 3. Common symptoms, and what they actually are

| What the staff sees | What it usually is | What fixes it |
|---|---|---|
| First page of the day takes ~5 seconds | Free hosting and the database waking up | Nothing. It is quick after the first load. |
| "Form expired" after pressing Save | The page sat open past the 8-hour session | Sign in again and redo that one form |
| "This site can't be reached" | The network, not the system | Try mobile data. If that works, it is the internet connection. |
| A patient did not get their reminder | Their reminder channel, or SMS | Check their profile. SMS only reaches Globe/TM — see §6. |
| Cannot book: "already has an appointment" | Working as intended, one booking per patient per service per day | Open the existing appointment instead |
| Medicine missing from the dispense list | It was archived | Inventory → the **archived** pill → open it → Ibalik sa listahan |
| Staff account cannot sign in | Deactivated, or a locked-out password | An admin reactivates it, or resets the password |
| "Too many attempts" on sign-in | Five wrong passwords in 15 minutes | Wait. It clears itself; it is not permanent. |

---

## 4. When it is actually broken

A real fault looks like: **every page** failing, an error page with a number on it (500), or a number on the screen that disagrees with the database.

1. Check whether it is down for everyone or for one computer — phone somebody on a different connection. That single question separates "the system is down" from "this network cannot reach it", and they have nothing in common.
2. Check the host dashboard (`dashboard.render.com` for the app, `console.neon.tech` for the database). If the service is down there, it is the platform, not the code, and it comes back on its own.
3. If it is the system, it needs whoever maintains the code. Below is the honest version of who that is.

---

## 5. Who maintains this, and for how long

**Now, and until handover:** Group 7. Best effort, no guaranteed response time, and that is the truth rather than a hedge.

**After handover:** whoever the clinic designates. The system is built so that everything the clinic does day to day needs no developer at all:

| The clinic does this themselves | Needs a developer |
|---|---|
| Add, edit, deactivate staff accounts | Changing what a page shows or does |
| Add medicines, correct stock, archive | Adding a new report or service type |
| Add services, patients, appointments | Anything in the code |
| Reset a patient's portal password | Upgrading a host that has changed |
| Read every report | |

**What genuinely needs attention over time**, and none of it is weekly:

- **Account ownership.** Render, Neon, Brevo, PhilSMS and cron-job.org are all currently under a student's email. On handover these must move to a clinic-owned address, or the clinic loses the system when that address is abandoned. **This is the one item that cannot wait for a problem to appear.**
- **Free-tier limits.** Neon's free plan allows 191.9 compute-hours a month. If use grows past it, somebody has to pay or upgrade.
- **Backups.** Neon's free plan keeps a short backup window. There is no scheduled export.
- **Dependency updates.** `npm audit` once or twice a year.
- **Keys.** The Brevo and PhilSMS keys can expire or be rotated.

---

## 6. Known limits, stated plainly

Better said by us than found by a panel.

- **SMS reaches Globe and TM only.** PhilSMS's shared sender ID does not deliver to Smart or TNT. A registered sender ID is ₱3,000/year and their application form excludes "testing, academic research, or thesis purposes" outright. Email has no such limit.
- **The hosting sleeps.** Free tier: the first request after idle takes a few seconds.
- **No uptime guarantee**, which is why the clinic's paper process must remain able to run for a day without the system.
- **The portal is read-only** for patients. Deliberate — one calendar, one set of hands writing into it.
- **Two facts the clinic still owes the privacy notice**: the Data Protection Officer's contact, and the retention period. Both are marked on `/privacy` and visible to anyone who reads it.

---

## 7. For the panel, in three sentences

> Day-to-day operation needs no developer: staff, medicines, services, accounts and reports are all managed inside the system by an admin. Hosting and the database are managed platforms, so server patching, SSL and uptime sit with them. What remains is periodic — account ownership at handover, backups, and dependency updates — and it is documented here rather than left as tribal knowledge.

If asked **"so who does the clinic call?"**, the honest answer is the one above plus: *"Group 7 until handover, and the handover moves account ownership and this runbook to the clinic."* Do not promise a response time.
