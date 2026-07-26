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
const { buildPatientRecordPdf } = require("../lib/pdf");
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
