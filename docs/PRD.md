# PRD — Product Requirements

Plain-language spec of WHAT to build. Maps directly to the thesis objectives.

## 1. Goal
Replace the clinic's manual logbooks with one online system that centralizes patient records,
tracks appointments, reminds patients automatically, manages medicine stock, and reports on
operations — usable by non-technical staff.

## 2. Users & roles

| Role | Who | Can do |
|---|---|---|
| **admin** | System owner / lead | Everything, incl. managing user accounts |
| **nurse** | Head nurse | Full patient records, appointments, vitals, dispensing, reports |
| **facilitator** | Clinic helpers | Register patients, record vitals, manage appointments, dispense (non-approval) |
| **recorder** | Records keeper | Encode/edit records, generate reports, exports |
| **doctor** | Visiting doctor | Review records, write diagnoses, **approve medicine dispensing** |
| **patient** | Community member | Portal only: view OWN next appointment, reminders, and clinic-permitted records |

Every page/route must check the role. Patients can **never** see other patients or staff screens.

## 3. Modules (features)

### M1 — Authentication & Roles
- Staff login (username + password, bcrypt). Sessions. Logout.
- Admin can create/disable staff accounts and set roles.
- Role-based access middleware on every route.

### M2 — Patient Records (the EMR core)
- Register a patient → auto-generate `patient_number` (e.g. `SHC-2026-0001`).
- Store: demographics, designated family contact, minor/guardian fields.
- A patient profile with tabs (mirror the prototype): **Overview, Vital Signs & Notes,
  Immunization & Vaccines, Prenatal Care, Medications, Visit History & Attendance.**
- Add records into each tab (vitals, immunization dose, prenatal visit, medication, visit).
- Search patients by name or patient number (instant, like the prototype's top search).

### M3 — Appointments & Daily List
- Create/reschedule/cancel an appointment (patient + service + date).
- Auto-generate the **daily list**: "who is expected today/tomorrow" per service.
- Mark attendance: `scheduled → completed | missed | cancelled`.
- No patient self-booking (panel said it's redundant — staff set next-visit dates).

### M4 — Notifications (SMS + Email)
- Daily cron builds tomorrow's list and sends reminders.
- Channel logic: patient phone → SMS; opted-in email → email; no contact → **family fallback**;
  none → add to a "manual follow-up" list.
- Log every send (sent/failed) in `notifications`.
- Low-credit alert to admin.

### M5 — Patient Portal
- Patient self-registration → basic info + valid ID; staff verifies (`is_verified`).
- After login: see next appointment, reminders, and ONLY clinic-permitted records
  (e.g., immunization card, family planning card). No sensitive/restricted data.
- Password recovery via system-generated `recovery_id` or in-person at the clinic.

### M6 — Medicine Inventory
- Add/edit medicines, track `stock_quantity`, flag low stock (< threshold).
- Record a dispense (patient + medicine + qty) → auto-subtract from stock.
- If `requires_doctor_approval`, the dispense is pending until a `doctor` approves it.

### M7 — Reports & Analytics
- Attendance summary, **no-show list** (filterable/searchable), seasonal-case trends,
  inventory/low-stock report. Daily/weekly/monthly ranges.
- Charts optional (Chart.js); a clean filterable table is the must-have.

### M8 — Document Export & Print
- Export a patient record or a standard form to **printable PDF** (for hard copies that
  need control numbers or wet signatures). Use a server-side PDF lib.

## 4. Services & weekly schedule
The thesis paper lists **3 services**: Immunization (Tue), Prenatal (Thu), Medicine distribution (Fri).
The Claude Design prototype also shows **Consultation & Maintenance** on Mon/Wed/Fri.

> ⚠️ **Decision needed (confirm with the barangay):** keep 3 services (paper) or add
> "Consultation & Maintenance" (prototype)? Build the `services` table as **data-driven** so
> services can be added/edited without code changes — that way either choice works.

## 5. Out of scope (do NOT build)
Emergency/urgent-care handling, laboratory information system, billing/accounting,
pharmacy point-of-sale, hospital-wide interoperability. These stay manual.

## 6. Definition of done (every feature)
Works end-to-end · role-checked · validates input · shows friendly errors · matches the
design system · doesn't break existing features · no secrets in code.
