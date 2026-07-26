# Sampaguita Health Clinic System — Staff Guide

A plain-language guide to the clinic's patient records, appointments, medicine inventory, and reports
system. No computer background needed — if you can use Facebook or GCash, you can use this.

---

## 1. Logging in

1. Open the link your clinic gives you (looks like `https://sampaguita-clinic.onrender.com`, or
   `http://localhost:3000` if you're on the computer running it directly).
2. Enter your **username** and **password** and click **Sign in**.
3. If you forget your password, ask your system administrator to reset it — there's no self-service
   "forgot password" for staff accounts (patients have their own separate portal with that option —
   see section 6).

Your account has a **role** (nurse, facilitator, recorder, doctor, or admin), shown next to your name
top-right. Most of this system works the same for every role — the two exceptions are:
- **Reports** (attendance, no-shows, trends, inventory numbers) — visible to nurse, recorder, and admin.
- **Approving a medicine request that needs a doctor's sign-off** — only the doctor account can do this.

---

## 2. Your everyday tasks

### Registering a new patient
1. Click the **people icon** in the left rail (or "**+ Add patient**" from the Patients page).
2. Fill in their name, birthdate, sex, address, and at least one way to reach them — either their
   own phone number, or a family member's.
3. **If the patient is under 18**, tick "Patient is a minor" — this reveals two more required fields:
   the guardian's name, and a checkbox confirming the guardian has agreed to treatment and to us
   keeping their data (this is a legal requirement, not optional).
4. Click **Create patient**. The system gives them a patient number automatically (like
   `SAMP-2026-0001`) — you don't need to make one up.

### Booking an appointment
1. From a patient's page, click **+ Book appointment** (or use the calendar icon in the left rail).
2. Pick the **service** — Immunization, Prenatal, or Medicine distribution. Each one only runs on
   its own fixed day of the week (Tue / Thu / Fri) — the date picker will only let you choose a
   matching date.
3. Click **Book appointment**. If the patient has an email on file, they get a confirmation email
   right away. The day before the appointment, they (or their family contact, if they have no
   email/phone of their own) get an automatic reminder too — you don't need to do anything for that.

### On the day of the clinic (marking attendance)
1. Open the **calendar icon** — this shows today's expected patients, grouped by service.
2. As each patient arrives and is seen, click **Done** next to their name. If someone doesn't show
   up, click **Missed** instead. Made a mistake? Click **Undo** to put it back to "Scheduled".
3. Need to move someone to a different day? Click **Reschedule**.

### Dispensing medicine
1. Open the **archive/box icon** (Inventory) and find the medicine, or go to the patient's page and
   click **+ Dispense medicine**.
2. Choose the patient, the medicine, and how many units. Click **Dispense**.
3. **Most medicines are given out immediately** and the stock count drops right away.
4. **Some medicines are flagged "Doctor approval"** (you'll see a badge on the inventory list) —
   things like antibiotics or controlled pain medicine. For these, dispensing just files a *request*;
   the stock does **not** move yet, and the item sits in a queue until the doctor reviews it.

### Approving a medicine request (doctor account only)
1. Open **Inventory → Dispenses**, or the "pending doctor approval" number on the Inventory page.
2. The **Pending** tab lists every request waiting on you.
3. Click **Approve** to sign off (this is the moment stock actually gets deducted), or **Reject** if
   it shouldn't go out (this just removes the request — nothing was taken from the shelf yet, so
   there's nothing to undo).

### Low stock
The Inventory page flags any medicine that's dropped below its restock threshold with a red **Low**
badge, and shows the count at the top of the page too. There's no separate "reorder" button in the
system yet — this is meant as a heads-up for whoever handles restocking to act on.

---

## 3. Reports *(nurse, recorder, and admin accounts)*

Click the **chart icon** in the left rail. There are four tabs:
- **Attendance** — how many patients were scheduled, seen, or missed per service, for any date range.
- **No-shows** — a searchable list of missed appointments, with a one-click "Book follow-up" button.
- **Seasonal trend** — how appointment volume for each service changes month to month.
- **Inventory** — how much of each medicine was given out in a date range, plus the live low-stock list.

Every report lets you pick a **From/To** date range at the top.

## 4. Printing a patient's record

Open any patient's page and click **Export PDF** (next to Edit). It opens in a new tab as a clean,
one-page summary — demographics, family contact, appointment history, and medicines given — ready
to print (Ctrl+P / Cmd+P) or save.

## 5. The patient portal

Patients can also access their own limited view at `/portal` (a different login from staff).
- **They sign up themselves**, matching their name/birthdate/patient number against our records.
- Until a staff member checks their **valid ID** in person and clicks **Verify**, they can only see
  that they have an account — they can't book, and can't see their visit history yet.
- Once verified, they can see their upcoming appointment, book/cancel their own appointments
  (services still follow the fixed weekday rule, and they can't have more than 3 open bookings at
  once), and see their own visit + medicine history.
- If a patient forgets their portal password, they use the **recovery code** they were given at
  sign-up. If they've lost that too, a staff member can issue them a new one from their patient page
  ("Reset password").

## 6. Common questions

**"The reminder didn't send at the appointment time."**
Reminders aren't tied to the appointment's time — they go out **the day before**, at a fixed time
each morning. If a patient books same-day or next-day, there may not be time for that automatic
reminder to fire — but they still get an **instant confirmation email** the moment the appointment
is booked, so they're not left without any notice.

**"SMS reminders aren't going out."**
SMS is not connected yet — the clinic hasn't set up an SMS provider. Everything runs on email for
now; SMS will switch on automatically (no re-training needed) once that's arranged.

**"I dispensed the wrong medicine / wrong amount by mistake."**
If it was a **doctor-approval** medicine and still shows "Pending", ask the doctor to **Reject** it —
nothing was taken from stock yet. If it already went through (normal medicine, or already approved),
there's no built-in "undo" — let your administrator know so the stock count can be corrected manually.

**"A page looks broken or shows an error."**
Take a screenshot (or write down exactly what you clicked and what happened) and pass it along to
whoever maintains the system for you. Try refreshing the page first — sometimes that's all it needs.

---

*This system was built for Barangay Sampaguita Health Clinic as a BS-IT thesis project (Group 7).*
