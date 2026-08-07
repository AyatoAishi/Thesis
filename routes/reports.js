// ============================================================================
// routes/reports.js — analytics + PDF export (M7)
// Attendance/no-shows/trend/inventory are gated to nurse,recorder,admin per
// docs/ARCHITECTURE.md's routes table (same convention as reminders.js being
// admin-only — a documented, deliberate restriction, not an oversight).
// Export is left open to any signed-in staff, also per that table.
//
// "Seasonal-case trend" is built from `appointments` (service + date), not
// `visits`/diagnosis — nothing in this app ever writes a visits row (there's
// no visits UI), so appointment volume per service per month is the only
// data that can actually show a real trend.
// ============================================================================
const express = require("express");
const PDFDocument = require("pdfkit");
const db = require("../db");
const F = require("../lib/format");
const { buildPatientRecordPdf, buildReportPdf } = require("../lib/pdf");
const { requireRole } = require("../middleware/auth");

const router = express.Router();
const REPORT_ROLES = ["nurse", "recorder", "admin"];

// Shape AND calendar validity (rejects e.g. "2020-02-31" — that only reaches
// here via a hand-edited URL, since a native <input type="date"> can't submit
// it, but a raw SQL date comparison would otherwise 500 on it instead of
// falling back to the default range below).
function isDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Defaults to the last 30 days (inclusive of today); falls back to that
// default whenever the query string is missing or the range is invalid.
function dateRange(query) {
  const to = isDate(query.to) ? query.to : F.manilaToday();
  const from = isDate(query.from) && query.from <= to ? query.from : F.addDays(to, -29);
  return { from, to };
}

// Streams a report PDF and ends the response — call instead of res.render()
// when ?format=pdf is present.
function sendReportPdf(res, filename, { title, subtitle, generatedBy, sections }) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  const doc = new PDFDocument({ margin: 50, size: "A4", compress: false });
  doc.pipe(res);
  buildReportPdf(doc, { title, subtitle, generatedBy, sections });
  doc.end();
}

// dispensed_at is a TIMESTAMPTZ — read its calendar date in the clinic's own
// timezone (like manilaToday() does), so a dispense just after midnight
// Manila time doesn't get attributed to the wrong day.
function manilaDateStr(ts) {
  return new Date(ts).toLocaleDateString("en-CA", { timeZone: F.TZ });
}

// Age as of a 'YYYY-MM-DD' date, in months if under 1 year (matches how the
// barangay's paper consumption log records infants — "7mos" rather than "0").
// birthdate is a DATE column (UTC-midnight Date object, no time-of-day
// meaning), so UTC getters read it back exactly as stored.
function ageAt(birthdate, atDateStr) {
  if (!birthdate) return "—";
  const bd = new Date(birthdate);
  const [ay, am, ad] = atDateStr.split("-").map(Number);
  let months = (ay - bd.getUTCFullYear()) * 12 + (am - 1 - bd.getUTCMonth());
  if (ad < bd.getUTCDate()) months--;
  months = Math.max(months, 0);
  return months < 12 ? `${months} mos` : `${Math.floor(months / 12)}`;
}

async function loadServices() {
  const { rows } = await db.query("SELECT service_id, name FROM services ORDER BY service_id");
  return rows;
}

// ---- landing  GET /reports  -> first tab -----------------------------------
router.get("/reports", (req, res) => res.redirect("/reports/attendance"));

// ---- ATTENDANCE SUMMARY  GET /reports/attendance ---------------------------
router.get("/reports/attendance", requireRole(...REPORT_ROLES), async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const { rows } = await db.query(
      `SELECT s.service_id, s.name,
              count(*) FILTER (WHERE a.status='scheduled')::int AS scheduled,
              count(*) FILTER (WHERE a.status='completed')::int AS completed,
              count(*) FILTER (WHERE a.status='missed')::int    AS missed,
              count(*) FILTER (WHERE a.status='cancelled')::int AS cancelled,
              count(*)::int AS total
         FROM appointments a JOIN services s ON s.service_id = a.service_id
        WHERE a.appointment_date BETWEEN $1 AND $2
        GROUP BY s.service_id, s.name
        ORDER BY s.service_id`,
      [from, to]
    );
    const totals = rows.reduce(
      (t, r) => {
        t.scheduled += r.scheduled;
        t.completed += r.completed;
        t.missed += r.missed;
        t.cancelled += r.cancelled;
        t.total += r.total;
        return t;
      },
      { scheduled: 0, completed: 0, missed: 0, cancelled: 0, total: 0 }
    );

    if (req.query.format === "pdf") {
      return sendReportPdf(res, `attendance-${from}_to_${to}.pdf`, {
        title: "Attendance report",
        subtitle: `${F.longDate(from)} – ${F.longDate(to)}`,
        generatedBy: req.session.user.full_name,
        sections: [
          {
            title: "By service",
            headers: ["Service", "Scheduled", "Completed", "Missed", "Cancelled", "Total"],
            rows: rows.map((r) => [F.prettyService(r.name), r.scheduled, r.completed, r.missed, r.cancelled, r.total]),
            widths: [175, 65, 70, 60, 70, 55],
          },
          {
            title: "Overall totals",
            kv: [
              ["Scheduled", totals.scheduled],
              ["Completed", totals.completed],
              ["Missed", totals.missed],
              ["Cancelled", totals.cancelled],
              ["Total", totals.total],
            ],
          },
        ],
      });
    }

    res.render("reports/attendance", {
      title: "Attendance report · Sampaguita HC",
      active: "reports",
      from,
      to,
      rows,
      totals,
      pretty: F.prettyService,
    });
  } catch (e) {
    next(e);
  }
});

// ---- NO-SHOW LIST  GET /reports/no-shows -----------------------------------
router.get("/reports/no-shows", requireRole(...REPORT_ROLES), async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const service_id = parseInt(req.query.service_id, 10) || null;
    const q = (req.query.q || "").trim();

    const conds = ["a.status='missed'", "a.appointment_date BETWEEN $1 AND $2"];
    const params = [from, to];
    if (service_id) {
      params.push(service_id);
      conds.push(`a.service_id = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      conds.push(`(p.full_name ILIKE $${params.length} OR p.patient_number ILIKE $${params.length})`);
    }

    const [{ rows }, services] = await Promise.all([
      db.query(
        `SELECT a.appointment_id, a.appointment_date, a.appointment_time, s.name AS service_name,
                p.patient_id, p.patient_number, p.full_name, p.contact_number, p.family_contact_number
           FROM appointments a
           JOIN services s ON s.service_id = a.service_id
           JOIN patients p ON p.patient_id = a.patient_id
          WHERE ${conds.join(" AND ")}
          ORDER BY a.appointment_date DESC
          LIMIT 500`,
        params
      ),
      loadServices(),
    ]);

    if (req.query.format === "pdf") {
      return sendReportPdf(res, `no-shows-${from}_to_${to}.pdf`, {
        title: "No-show list",
        subtitle: `${F.longDate(from)} – ${F.longDate(to)}`,
        generatedBy: req.session.user.full_name,
        sections: [
          {
            title: "Missed appointments",
            headers: ["Date", "Patient", "Service", "Contact"],
            rows: rows.map((r) => [
              F.longDate(r.appointment_date),
              `${r.full_name} (${r.patient_number})`,
              F.prettyService(r.service_name),
              r.contact_number || r.family_contact_number || "—",
            ]),
            widths: [90, 190, 130, 90],
          },
        ],
      });
    }

    res.render("reports/no-shows", {
      title: "No-show list · Sampaguita HC",
      active: "reports",
      from,
      to,
      rows,
      services,
      service_id,
      q,
      pretty: F.prettyService,
      longDate: F.longDate,
      shortTime: F.shortTime,
    });
  } catch (e) {
    next(e);
  }
});

// ---- SEASONAL / APPOINTMENT TREND  GET /reports/trend ----------------------
router.get("/reports/trend", requireRole(...REPORT_ROLES), async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const { rows } = await db.query(
      `SELECT to_char(date_trunc('month', a.appointment_date), 'YYYY-MM') AS month,
              s.service_id, s.name AS service_name,
              count(*)::int AS total
         FROM appointments a JOIN services s ON s.service_id = a.service_id
        WHERE a.appointment_date BETWEEN $1 AND $2
        GROUP BY month, s.service_id, s.name
        ORDER BY month, s.service_id`,
      [from, to]
    );

    const months = [...new Set(rows.map((r) => r.month))].sort();
    const services = [...new Map(rows.map((r) => [r.service_id, r.service_name])).entries()]
      .map(([service_id, name]) => ({ service_id, name }))
      .sort((a, b) => a.service_id - b.service_id);

    const grid = {};
    rows.forEach((r) => {
      grid[r.service_id] ||= {};
      grid[r.service_id][r.month] = r.total;
    });

    const chartData = {
      labels: months,
      datasets: services.map((s) => ({
        label: F.prettyService(s.name),
        data: months.map((m) => (grid[s.service_id] && grid[s.service_id][m]) || 0),
      })),
    };

    if (req.query.format === "pdf") {
      return sendReportPdf(res, `trend-${from}_to_${to}.pdf`, {
        title: "Seasonal / appointment trend",
        subtitle: `${F.longDate(from)} – ${F.longDate(to)}`,
        generatedBy: req.session.user.full_name,
        sections: [
          {
            title: "Appointments per month, by service",
            headers: ["Month", ...services.map((s) => F.prettyService(s.name))],
            rows: months.map((m) => [m, ...services.map((s) => (grid[s.service_id] && grid[s.service_id][m]) || 0)]),
            widths: [70, ...services.map(() => Math.floor(425 / Math.max(services.length, 1)))],
          },
        ],
      });
    }

    res.render("reports/trend", {
      title: "Seasonal trend · Sampaguita HC",
      active: "reports",
      from,
      to,
      months,
      services,
      grid,
      chartData,
      pretty: F.prettyService,
    });
  } catch (e) {
    next(e);
  }
});

// ---- INVENTORY REPORT  GET /reports/inventory ------------------------------
router.get("/reports/inventory", requireRole(...REPORT_ROLES), async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const [lowQ, dispensedQ] = await Promise.all([
      db.query(
        `SELECT medicine_id, name, unit, stock_quantity, low_stock_threshold
           FROM medicines
          WHERE stock_quantity < low_stock_threshold
          ORDER BY name`
      ),
      db.query(
        `SELECT m.medicine_id, m.name, m.unit,
                count(*)::int AS dispense_count,
                sum(d.quantity)::int AS total_qty,
                count(*) FILTER (WHERE d.requires_doctor_approval AND d.approved_at IS NULL)::int AS pending_count
           FROM medicine_dispenses d JOIN medicines m ON m.medicine_id = d.medicine_id
          WHERE d.dispensed_at::date BETWEEN $1 AND $2
          GROUP BY m.medicine_id, m.name, m.unit
          ORDER BY total_qty DESC`,
        [from, to]
      ),
    ]);

    if (req.query.format === "pdf") {
      return sendReportPdf(res, `inventory-${from}_to_${to}.pdf`, {
        title: "Inventory report",
        subtitle: `Dispensing activity ${F.longDate(from)} – ${F.longDate(to)}`,
        generatedBy: req.session.user.full_name,
        sections: [
          {
            title: "Low stock",
            headers: ["Medicine", "Unit", "Stock", "Threshold"],
            rows: lowQ.rows.map((m) => [m.name, m.unit || "—", m.stock_quantity, m.low_stock_threshold]),
            widths: [220, 90, 90, 95],
          },
          {
            title: "Dispensed in range",
            headers: ["Medicine", "Dispenses", "Total qty", "Pending approval"],
            rows: dispensedQ.rows.map((m) => [m.name, m.dispense_count, `${m.total_qty} ${m.unit || ""}`.trim(), m.pending_count]),
            widths: [200, 90, 110, 95],
          },
        ],
      });
    }

    res.render("reports/inventory", {
      title: "Inventory report · Sampaguita HC",
      active: "reports",
      from,
      to,
      lowStock: lowQ.rows,
      dispensed: dispensedQ.rows,
    });
  } catch (e) {
    next(e);
  }
});

// ---- CONSUMPTION REPORT  GET /reports/consumption ---------------------------
// Matches the barangay's existing paper "Consumption Report" log (date, patient,
// age, medicine + quantity given, signature) so this can replace it directly —
// same columns, same order. Only counts medicine that actually left the shelf
// (completed, or approved if it needed doctor sign-off) — a still-pending
// request was never consumed. Signature is the staff member who dispensed it,
// the digital equivalent of the pen signature on the paper version.
router.get("/reports/consumption", requireRole(...REPORT_ROLES), async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const { rows } = await db.query(
      `SELECT d.dispensed_at, p.full_name AS patient_name, p.birthdate,
              m.name AS medicine_name, m.unit, d.quantity,
              u.full_name AS dispensed_by_name
         FROM medicine_dispenses d
         JOIN patients p ON p.patient_id = d.patient_id
         JOIN medicines m ON m.medicine_id = d.medicine_id
         LEFT JOIN users u ON u.user_id = d.dispensed_by
        WHERE d.dispensed_at::date BETWEEN $1 AND $2
          AND (d.requires_doctor_approval = false OR d.approved_at IS NOT NULL)
        ORDER BY d.dispensed_at`,
      [from, to]
    );
    const items = rows.map((r) => {
      const date = manilaDateStr(r.dispensed_at);
      return { ...r, date, age: ageAt(r.birthdate, date) };
    });

    if (req.query.format === "pdf") {
      return sendReportPdf(res, `consumption-${from}_to_${to}.pdf`, {
        title: "Consumption report",
        subtitle: `${F.longDate(from)} – ${F.longDate(to)}`,
        generatedBy: req.session.user.full_name,
        sections: [
          {
            title: "Medicine given",
            headers: ["Date", "Name of patient", "Age", "Medicine / quantity given", "Signature"],
            rows: items.map((it) => [
              F.longDate(it.date),
              it.patient_name,
              it.age,
              `${it.medicine_name} — ${it.quantity} ${it.unit || ""}`.trim(),
              it.dispensed_by_name || "—",
            ]),
            widths: [75, 140, 45, 175, 60],
          },
        ],
      });
    }

    res.render("reports/consumption", {
      title: "Consumption report · Sampaguita HC",
      active: "reports",
      from,
      to,
      items,
      longDate: F.longDate,
    });
  } catch (e) {
    next(e);
  }
});

// ---- SENIOR CITIZEN MEDICINE TRACKING  GET /reports/senior-citizen ---------
// Matches the barangay's paper "Medicines for Senior Citizen" hypertension/
// diabetes log: patients 60+ as rows, the maintenance medicines they're on as
// columns, total packs given (within the date range) as the cell value.
// Diagnosis and PhilHealth No. from the paper form are deliberately left out —
// neither is captured anywhere in this system yet, and a column that's always
// blank on an exported PDF reads as broken rather than "fill in by hand."
// Medicine columns are matched by name against the clinic's own inventory
// (not hardcoded IDs), so this works however each clinic has actually named
// their stock, and simply shows nothing if a tracked medicine isn't in
// inventory yet.
const SENIOR_MED_PATTERNS = [
  "%amlodipine%", "%losartan%", "%metoprolol%", "%simvastatin%", "%metformin%", "%gliclazide%",
];

router.get("/reports/senior-citizen", requireRole(...REPORT_ROLES), async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);

    const { rows: meds } = await db.query(
      `SELECT medicine_id, name, dosage, unit FROM medicines
        WHERE name ILIKE ANY ($1) ORDER BY name, dosage`,
      [SENIOR_MED_PATTERNS]
    );

    let patientRows = [];
    if (meds.length) {
      const { rows } = await db.query(
        `SELECT p.patient_id, p.full_name, p.sex, p.birthdate,
                d.medicine_id, sum(d.quantity)::int AS qty
           FROM medicine_dispenses d
           JOIN patients p ON p.patient_id = d.patient_id
          WHERE d.dispensed_at::date BETWEEN $1 AND $2
            AND (d.requires_doctor_approval = false OR d.approved_at IS NOT NULL)
            AND d.medicine_id = ANY ($3)
            AND EXTRACT(YEAR FROM age($2::date, p.birthdate)) >= 60
          GROUP BY p.patient_id, p.full_name, p.sex, p.birthdate, d.medicine_id`,
        [from, to, meds.map((m) => m.medicine_id)]
      );

      const byPatient = new Map();
      rows.forEach((r) => {
        if (!byPatient.has(r.patient_id)) {
          byPatient.set(r.patient_id, {
            patient_id: r.patient_id,
            full_name: r.full_name,
            sex: r.sex,
            age: ageAt(r.birthdate, to),
            qty: {},
          });
        }
        byPatient.get(r.patient_id).qty[r.medicine_id] = r.qty;
      });
      patientRows = [...byPatient.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
    }

    if (req.query.format === "pdf") {
      return sendReportPdf(res, `senior-citizen-meds-${from}_to_${to}.pdf`, {
        title: "Senior citizen medicine tracking",
        subtitle: `Hypertension / diabetes maintenance medicines · ${F.longDate(from)} – ${F.longDate(to)}`,
        generatedBy: req.session.user.full_name,
        sections: [
          {
            title: "Packs given per patient",
            headers: ["Name", "Age", "Sex", ...meds.map((m) => `${m.name}${m.dosage ? " " + m.dosage : ""}`)],
            rows: patientRows.map((p) => [
              p.full_name,
              p.age,
              p.sex || "—",
              ...meds.map((m) => p.qty[m.medicine_id] ?? "—"),
            ]),
            widths: [110, 30, 35, ...meds.map(() => Math.floor(320 / Math.max(meds.length, 1)))],
          },
        ],
      });
    }

    res.render("reports/senior-citizen", {
      title: "Senior citizen medicine tracking · Sampaguita HC",
      active: "reports",
      from,
      to,
      meds,
      patientRows,
    });
  } catch (e) {
    next(e);
  }
});

// ---- FAMILY PLANNING ACCEPTORS  GET /reports/family-planning ---------------
// Matches the barangay's paper "List of Acceptors" log: date, name, age,
// address, contact, commodity received, signature. Unlike the senior-citizen
// medicines, Alyanna's notes don't give a fixed name list for "family
// planning commodity" — staff mark a medicine as one explicitly (Inventory →
// Add/Edit medicine → "family planning commodity" checkbox) instead of the
// report guessing from the name.
router.get("/reports/family-planning", requireRole(...REPORT_ROLES), async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const { rows } = await db.query(
      `SELECT d.dispensed_at, p.patient_id, p.full_name AS patient_name, p.birthdate,
              p.address, p.contact_number, p.family_contact_number,
              m.name AS medicine_name, m.unit, d.quantity,
              u.full_name AS dispensed_by_name
         FROM medicine_dispenses d
         JOIN patients p ON p.patient_id = d.patient_id
         JOIN medicines m ON m.medicine_id = d.medicine_id
         LEFT JOIN users u ON u.user_id = d.dispensed_by
        WHERE d.dispensed_at::date BETWEEN $1 AND $2
          AND (d.requires_doctor_approval = false OR d.approved_at IS NOT NULL)
          AND m.is_family_planning = true
        ORDER BY d.dispensed_at`,
      [from, to]
    );
    const items = rows.map((r) => {
      const date = manilaDateStr(r.dispensed_at);
      return { ...r, date, age: ageAt(r.birthdate, date) };
    });
    const acceptorCount = new Set(items.map((it) => it.patient_id)).size;

    if (req.query.format === "pdf") {
      return sendReportPdf(res, `family-planning-${from}_to_${to}.pdf`, {
        title: "Family planning acceptors",
        subtitle: `${F.longDate(from)} – ${F.longDate(to)} · ${acceptorCount} acceptor${acceptorCount === 1 ? "" : "s"}`,
        generatedBy: req.session.user.full_name,
        sections: [
          {
            title: "List of acceptors",
            headers: ["Date", "Name of acceptor", "Age", "Address", "Contact no.", "Commodity received", "Signature"],
            rows: items.map((it) => [
              F.longDate(it.date),
              it.patient_name,
              it.age,
              it.address || "—",
              it.contact_number || it.family_contact_number || "—",
              `${it.medicine_name} — ${it.quantity} ${it.unit || ""}`.trim(),
              it.dispensed_by_name || "—",
            ]),
            widths: [55, 95, 25, 105, 70, 100, 45],
          },
        ],
      });
    }

    res.render("reports/family-planning", {
      title: "Family planning acceptors · Sampaguita HC",
      active: "reports",
      from,
      to,
      items,
      acceptorCount,
      longDate: F.longDate,
    });
  } catch (e) {
    next(e);
  }
});

// ---- PDF EXPORT  GET /reports/export/patient/:id ---------------------------
// Open to any signed-in staff (docs/ARCHITECTURE.md: export = "staff", wider
// than the analytics pages above).
router.get("/reports/export/patient/:id", async (req, res, next) => {
  try {
    const pQ = await db.query("SELECT * FROM patients WHERE patient_id=$1", [req.params.id]);
    if (!pQ.rows[0]) return next();
    const patient = pQ.rows[0];

    const [apptsQ, dispensesQ] = await Promise.all([
      db.query(
        `SELECT a.appointment_date, a.appointment_time, a.status, s.name AS service_name
           FROM appointments a JOIN services s ON s.service_id = a.service_id
          WHERE a.patient_id = $1
          ORDER BY a.appointment_date DESC, a.appointment_time NULLS LAST
          LIMIT 200`,
        [req.params.id]
      ),
      db.query(
        `SELECT d.dispensed_at, d.quantity, d.requires_doctor_approval, d.approved_at,
                m.name AS medicine_name, m.unit
           FROM medicine_dispenses d JOIN medicines m ON m.medicine_id = d.medicine_id
          WHERE d.patient_id = $1
          ORDER BY d.dispensed_at DESC
          LIMIT 200`,
        [req.params.id]
      ),
    ]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${patient.patient_number}-record.pdf"`);
    const doc = new PDFDocument({ margin: 50, size: "A4", compress: false });
    doc.pipe(res);
    buildPatientRecordPdf(doc, {
      patient,
      appointments: apptsQ.rows,
      dispenses: dispensesQ.rows,
      generatedBy: req.session.user.full_name,
    });
    doc.end();
  } catch (e) {
    next(e);
  }
});

module.exports = router;
