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
| A patient did not get their reminder | Their reminder channel, or the SMS phone | Check their profile. Then Reminders → **Send test SMS**: if it fails, the phone is off, offline, out of load, or the app was closed — see §6. |
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

- **Account ownership.** Render, Neon, Brevo, PhilSMS, cron-job.org, and the SMS phone's SIM are all currently under a student's name. On handover these must move to a clinic-owned address, or the clinic loses the system when that address is abandoned. **This is the one item that cannot wait for a problem to appear.**
- **Free-tier limits.** Neon's free plan allows 191.9 compute-hours a month. If use grows past it, somebody has to pay or upgrade.
- **Backups.** Neon's free plan keeps only a short restore window, so the system exports its own:
  the admin uses **Download backup** on Staff accounts, or a developer runs `npm run backup`
  (writes to `backups/`, which is gitignored — this repository is public). Once a week and before
  any big change is a sensible rhythm. The file holds every patient record: keep it on the clinic's
  own storage, never in email or a public folder. Restoring from it needs a developer; Neon's own
  restore window covers a mistake made in the last few hours.
  - Since Oct 2026 the downloaded file is **encrypted** (`.json.enc`) with a passphrase the admin
    types at download time. Nothing stores that passphrase: lose it and the file cannot be opened.
    To open it: `npm run backup:decrypt -- <file>`, or with plain OpenSSL:
    `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -in <file> -out backup.json`.
- **The super admin.** The original `admin` account is the super admin (`users.is_super_admin`).
  Other admins manage nurses, facilitators and recorders, but only the super admin can create,
  change, delete or reset an administrator, and nobody else can touch the super admin. At handover,
  the super admin's password goes to the clinic's head, not to a staff member.
- **Deleting staff.** An account that never recorded anything is deleted. One that did is
  *removed*: it can no longer sign in and disappears from the list, but stays in the database so
  the records it made still say who made them.
- **Dependency updates.** `npm audit` once or twice a year.
- **Keys.** The Brevo and PhilSMS keys can expire or be rotated. The SMS phone's gateway username and password change if the app is reinstalled — copy the new ones to Render.

---

## 6. Known limits, stated plainly

Better said by us than found by a panel.

- **SMS goes out through an Android phone, not an SMS company.** PhilSMS reached Globe and TM only (its shared sender ID skips Smart and TNT, and a registered one is ₱3,000/year and excludes thesis use) and stopped answering; Semaphore needs a ₱560 minimum top-up. So reminders are sent by an Android phone on its own SIM and load, through the free, open-source *SMS Gateway for Android* app: the system hands each message to the app's relay over the internet, and the phone sends it as an ordinary text. It reaches every network. What that means in practice:
  - Patients see **that phone's number** as the sender, which is why every message starts with "Sampaguita Health Clinic:".
  - The phone must stay **on, charged, online, with load**, and the app allowed to run in the background. The Reminders page's **Send test SMS** button checks the whole path in a few seconds. A text the phone has not picked up is logged as *pending*, never as *sent*.
  - Messages are **end-to-end encrypted** (AES-256, with the passphrase set on both the server and the phone): the relay passes on ciphertext and cannot read patient names (RA 10173).
  - One SIM is not a bulk SMS service. Carriers and Android limit how fast one phone may send; a barangay's daily reminders are well inside that, a mass blast is not.
  - Moving to Semaphore or PhilSMS later is a settings change, not a code change: both adapters are already in `services/sms.js`. Set `SMS_PROVIDER` and that provider's keys (see "Setting up the SMS phone" below).
- **The hosting sleeps.** Free tier: the first request after idle takes a few seconds.
- **No uptime guarantee**, which is why the clinic's paper process must remain able to run for a day without the system.
- **The portal is read-only** for patients. Deliberate — one calendar, one set of hands writing into it.
- **Two facts the clinic still owes the privacy notice**: the Data Protection Officer's contact, and the retention period. Both are marked on `/privacy` and visible to anyone who reads it.

---

### Setting up the SMS phone

1. On an Android phone with a registered SIM and load (an unli-text promo is plenty), install **SMS Gateway for Android** (Play Store, or the APK from github.com/capcom6/android-sms-gateway).
2. Open it, turn on **Cloud server**, and press **Offline** so it connects and turns **Online**. It then shows a **username** and **password** for this phone.
3. In the app's settings, set an **encryption passphrase** (a long random phrase; write it down).
4. In Android settings, set the app's battery use to **Unrestricted**, and keep the phone plugged in.
5. On Render → the service → Environment, set:
   `SMS_PROVIDER=smsgate`, `SMSGATE_USERNAME`, `SMSGATE_PASSWORD`, and `SMSGATE_PASSPHRASE` (the same phrase as the app). Save; Render redeploys.
6. In the system: Reminders → **Send test SMS** to your own number. "Sent." means it works end to end.

The same four variables in a local `.env` make a local copy send through the same phone — which means a local copy left running at 8 AM would send the daily reminders too. Keep them on Render only.

---

## 7. For the panel, in three sentences

> Day-to-day operation needs no developer: staff, medicines, services, accounts and reports are all managed inside the system by an admin. Hosting and the database are managed platforms, so server patching, SSL and uptime sit with them. What remains is periodic — account ownership at handover, backups, and dependency updates — and it is documented here rather than left as tribal knowledge.

If asked **"so who does the clinic call?"**, the honest answer is the one above plus: *"Group 7 until handover, and the handover moves account ownership and this runbook to the clinic."* Do not promise a response time.
