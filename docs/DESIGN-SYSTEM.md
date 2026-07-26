# Design System

Match the **Claude Design prototype** in `design-reference/`
(`Sampaguita Clinic EMR (standalone).html` is the rendered version; `styles.css` has the source tokens).
Port these tokens into Tailwind config / CSS variables so the real app looks the same.

## Fonts
- **UI:** `Plus Jakarta Sans` (load from Google Fonts), fallback `system-ui, sans-serif`
- **Mono (IDs, numbers):** `JetBrains Mono`, fallback `ui-monospace, monospace`

## Colors (CSS variables)
```css
:root {
  /* accent (themeable) */
  --accent:#3b6cf5; --accent-strong:#2c54d6; --accent-soft:#e9f0fe; --accent-softer:#f3f7ff;
  /* surfaces */
  --bg:#eef2fb; --surface:#ffffff; --surface-2:#f7f9fe; --border:#e6ebf5; --border-strong:#d6deec;
  /* ink (text) */
  --ink:#182338; --ink-2:#4a566e; --ink-3:#8893a8; --ink-4:#aab3c6;
  /* status */
  --ok:#18a571;  --ok-bg:#e3f6ee;  --ok-ink:#0d7a52;
  --warn:#d99411; --warn-bg:#fbf0d8; --warn-ink:#9c6a08;
  --bad:#e1474d;  --bad-bg:#fce7e8;  --bad-ink:#b22b30;
  --info:#2c8fb8; --info-bg:#e2f3fa; --info-ink:#1d6f90;
  --violet:#7b5cf0; --violet-2:#9a7df6;
}
```
**Service colors:** Prenatal `#7b5cf0` (violet), Immunization `#2c8fb8` (teal), Consult `#3b6cf5` (blue).

## Geometry / spacing
- Radii: `xs 7 · sm 10 · md 14 · lg 18 · xl 24` (px)
- Layout widths: icon rail `66px` · patient queue `286px` · submenu `234px`
- Base gap/padding: `18px`
- Shadows: sm `0 1px 3px rgba(24,35,56,.04)` · md `0 4px 14px rgba(24,35,56,.06)` · lg `0 18px 50px rgba(24,35,56,.16)`

## Layout (the shell)
```
┌──────────────────────────────────────────────────────────┐
│ TopBar: brand · search(name/number) · today-service · 🔔 · user │
├──────┬───────────────┬───────────────────────────────────┤
│ Icon │ Patient Queue │   Main content / Record View       │
│ Rail │ (Today/All/…) │   (tabs: Overview, Vitals, Immun.,  │
│      │               │    Prenatal, Meds, Visit History)   │
└──────┴───────────────┴───────────────────────────────────┘
```
- **Icon rail** (left, 66px): Dashboard · Patients · Appointments · Inventory · Reports · Settings.
- **TopBar:** logo + name, search box (filters by name or patient number), "today's service" pill,
  notifications dropdown (stock/system alerts), user chip with **role switch** (Nurse/Facilitator/Recorder/Doctor).
- **Patient Queue** (toggleable): filterable list (Today / All / Prenatal) of patient cards (avatar, name, number, service tag).

## Screens to build
1. **Login** (staff) + **Portal login/register** (patients) — not in prototype, design to match.
2. **Dashboard** — today's expected list + alert cards (low stock, no-shows, counts).
3. **Patients** — search + queue + **Record View** with these tabs (already designed):
   - Overview, Vital Signs & Notes, Immunization & Vaccines, Prenatal Care, Medications, Visit History & Attendance.
   - Each tab has an **"Add New Record"** button opening a modal form (Vitals/Immunization/Prenatal/Meds/Visit forms exist in prototype `modals.jsx`).
4. **Appointments** — calendar/list + the auto daily list + attendance marking.
5. **Inventory** — medicine table, stock levels, low-stock flags, dispense + doctor-approval.
6. **Reports** — filterable tables (attendance, no-shows, seasonal), optional charts, PDF export.
7. **Patient Portal** — minimal: next appointment, reminders, permitted records only.

## Components (reuse the prototype's vocabulary)
`Avatar`, `ServiceTag` (colored pill), badges (`b-ok/b-warn/b-bad`), `PanelHead`, `EmptyState`,
`Modal`, `Field`, `Seg` (segmented toggle), cards, dropdowns. Recreate these as EJS partials + Tailwind.

## How to port the prototype
The prototype is React (`.jsx`) + plain CSS. You are building **EJS + Tailwind**. So:
1. Copy the CSS variables above into `public/css` (or Tailwind `theme.extend`).
2. Recreate each screen as an EJS template using the same structure/classes/spacing.
3. Reuse the sample data shapes in `design-reference/data.js` as a guide for fields —
   but real data comes from PostgreSQL (`db/schema.sql`), not `window.CLINIC`.
4. Keep it mobile-responsive (panel requirement: non-technical users, varied devices).
