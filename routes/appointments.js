// ============================================================================
// routes/appointments.js — booking, the daily schedule, and status tracking (M3)
// Behind requireLogin (mounted after the gate in server.js).
//
// Domain rules enforced here:
//   - Services are just a category (v1 update) — no fixed weekday. Staff/patients
//     pick the service and the date independently.
//   - No double-booking the same patient for the same service on the same date.
//   - No booking in the past.
// The daily schedule is the view staff use every clinic day, and is what the
// SMS reminder job (M4) will read from.
// ============================================================================
const express = require("express");
const db = require("../db");
const F = require("../lib/format");
const { sendBookingConfirmation } = require("../services/reminders");

const router = express.Router();

const STATUSES = ["scheduled", "completed", "missed", "cancelled"];
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

async function loadServices() {
  const { rows } = await db.query(
    "SELECT service_id, name, schedule_day, description FROM services ORDER BY service_id"
  );
  return rows;
}

// Validate a submitted booking against the domain rules. Returns { errors, value }.
function validateAppt(body, services) {
  const errors = [];
  const patient_id = parseInt(body.patient_id, 10) || null;
  const service_id = parseInt(body.service_id, 10) || null;
  const date = (body.appointment_date || "").trim();
  const time = (body.appointment_time || "").trim() || null;
  const notes = (body.notes || "").trim().slice(0, 255) || null;

  if (!patient_id) errors.push("Choose a patient.");
  if (!service_id) errors.push("Choose a service.");
  if (!isDate(date)) errors.push("Choose a valid date.");

  if (isDate(date) && date < F.manilaToday()) errors.push("That date is in the past.");

  // Services are no longer locked to a fixed weekday (v1 update) — staff choose
  // the service and the date independently.
  return { errors, value: { patient_id, service_id, date, time, notes } };
}

// Re-render the form after a validation failure (keeps the user's input).
async function rerenderForm(res, { mode, body, services, errors, appointment_id }) {
  let patient = null;
  let patients = null;
  if (body.patient_id) {
    const r = await db.query(
      "SELECT patient_id, patient_number, full_name FROM patients WHERE patient_id=$1",
      [parseInt(body.patient_id, 10) || 0]
    );
    patient = r.rows[0] || null;
  }
  if (!patient) {
    patients = (
      await db.query(
        "SELECT patient_id, patient_number, full_name FROM patients ORDER BY full_name LIMIT 500"
      )
    ).rows;
  }
  return res.status(400).render("appointments/form", {
    title: (mode === "edit" ? "Reschedule" : "Book appointment") + " · Sampaguita HC",
    active: "appointments",
    mode,
    appt: { ...body, appointment_id },
    services,
    patient,
    patients,
    errors,
    pretty: F.prettyService,
    today: F.manilaToday(),
  });
}

// ---- DAILY SCHEDULE  GET /appointments?date=YYYY-MM-DD ----------------------
router.get("/appointments", async (req, res, next) => {
  try {
    const date = isDate(req.query.date) ? req.query.date : F.manilaToday();
    const services = await loadServices();

    const { rows } = await db.query(
      `SELECT a.appointment_id, a.appointment_time, a.status, a.notes, a.service_id,
              s.name AS service_name, s.schedule_day,
              p.patient_id, p.patient_number, p.full_name,
              p.contact_number, p.family_contact_number
         FROM appointments a
         JOIN services s ON s.service_id = a.service_id
         JOIN patients p ON p.patient_id = a.patient_id
        WHERE a.appointment_date = $1
        ORDER BY a.service_id, a.appointment_time NULLS LAST, p.full_name`,
      [date]
    );

    // Build sections: one per service that actually has a booking on this date
    // (services no longer map to a fixed weekday — v1 update).
    const byId = new Map();
    const section = (id, name, day) => {
      if (!byId.has(id)) byId.set(id, { service_id: id, name, day, items: [] });
      return byId.get(id);
    };
    rows.forEach((r) => section(r.service_id, r.service_name, r.schedule_day).items.push(r));
    const groups = [...byId.values()].sort((a, b) => a.service_id - b.service_id);

    const count = (st) => rows.filter((r) => r.status === st).length;
    res.render("appointments/schedule", {
      title: "Appointments · Sampaguita HC",
      active: "appointments",
      date,
      today: F.manilaToday(),
      prevDate: F.addDays(date, -1),
      nextDate: F.addDays(date, 1),
      longDate: F.longDate(date),
      groups,
      summary: {
        total: rows.length,
        scheduled: count("scheduled"),
        completed: count("completed"),
        missed: count("missed"),
        cancelled: count("cancelled"),
      },
      pretty: F.prettyService,
      shortTime: F.shortTime,
    });
  } catch (e) {
    next(e);
  }
});

// ---- UPCOMING / status-filtered list  GET /appointments/upcoming -----------
router.get("/appointments/upcoming", async (req, res, next) => {
  try {
    const status = req.query.status === "all" || STATUSES.includes(req.query.status) ? req.query.status : "all";
    const today = F.manilaToday();
    const where =
      status === "all"
        ? "TRUE"
        : status === "scheduled"
        ? "a.status='scheduled' AND a.appointment_date >= $1"
        : "a.status=$1";
    const params = status === "all" ? [] : status === "scheduled" ? [today] : [status];
    const { rows } = await db.query(
      `SELECT a.appointment_id, a.appointment_date, a.appointment_time, a.status,
              s.name AS service_name, p.patient_id, p.patient_number, p.full_name
         FROM appointments a
         JOIN services s ON s.service_id = a.service_id
         JOIN patients p ON p.patient_id = a.patient_id
        WHERE ${where}
        ORDER BY a.appointment_date ${status === "scheduled" ? "ASC" : "DESC"},
                 a.appointment_time NULLS LAST
        LIMIT 300`,
      params
    );
    res.render("appointments/list", {
      title: "Appointments · Sampaguita HC",
      active: "appointments",
      rows,
      status,
      pretty: F.prettyService,
      shortTime: F.shortTime,
      longDate: F.longDate,
    });
  } catch (e) {
    next(e);
  }
});

// ---- BOOK form  GET /appointments/new --------------------------------------
router.get("/appointments/new", async (req, res, next) => {
  try {
    const services = await loadServices();
    let patient = null;
    if (req.query.patient_id) {
      const r = await db.query(
        "SELECT patient_id, patient_number, full_name FROM patients WHERE patient_id=$1",
        [parseInt(req.query.patient_id, 10) || 0]
      );
      patient = r.rows[0] || null;
    }
    const patients = patient
      ? null
      : (
          await db.query(
            "SELECT patient_id, patient_number, full_name FROM patients ORDER BY full_name LIMIT 500"
          )
        ).rows;

    res.render("appointments/form", {
      title: "Book appointment · Sampaguita HC",
      active: "appointments",
      mode: "new",
      appt: { appointment_date: isDate(req.query.date) ? req.query.date : "" },
      services,
      patient,
      patients,
      errors: [],
      pretty: F.prettyService,
      today: F.manilaToday(),
    });
  } catch (e) {
    next(e);
  }
});

// ---- CREATE  POST /appointments --------------------------------------------
router.post("/appointments", async (req, res, next) => {
  try {
    const services = await loadServices();
    const { errors, value } = validateAppt(req.body, services);

    if (!errors.length) {
      const dup = await db.query(
        `SELECT 1 FROM appointments
          WHERE patient_id=$1 AND service_id=$2 AND appointment_date=$3 AND status='scheduled'`,
        [value.patient_id, value.service_id, value.date]
      );
      if (dup.rowCount)
        errors.push("This patient is already booked for this service on that date.");
    }
    if (errors.length)
      return rerenderForm(res, { mode: "new", body: req.body, services, errors });

    const ins = await db.query(
      `INSERT INTO appointments
         (patient_id, service_id, appointment_date, appointment_time, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING appointment_id`,
      [value.patient_id, value.service_id, value.date, value.time, value.notes, req.session.user.user_id]
    );
    // Instant confirmation email — fire-and-forget so mail issues never block booking.
    sendBookingConfirmation(ins.rows[0].appointment_id, "booked")
      .catch((e) => console.error("[confirmation email]", e.message));
    res.redirect(`/appointments?date=${value.date}`);
  } catch (e) {
    next(e);
  }
});

// ---- RESCHEDULE form  GET /appointments/:id/edit ---------------------------
router.get("/appointments/:id/edit", async (req, res, next) => {
  try {
    const services = await loadServices();
    const { rows } = await db.query(
      `SELECT a.*, p.patient_number, p.full_name
         FROM appointments a JOIN patients p ON p.patient_id = a.patient_id
        WHERE a.appointment_id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return next();
    const a = rows[0];
    res.render("appointments/form", {
      title: "Reschedule · Sampaguita HC",
      active: "appointments",
      mode: "edit",
      appt: {
        appointment_id: a.appointment_id,
        patient_id: a.patient_id,
        service_id: a.service_id,
        appointment_date: a.appointment_date, // already 'YYYY-MM-DD' (date parser)
        appointment_time: a.appointment_time ? String(a.appointment_time).slice(0, 5) : "",
        notes: a.notes || "",
      },
      services,
      patient: { patient_id: a.patient_id, patient_number: a.patient_number, full_name: a.full_name },
      patients: null,
      errors: [],
      pretty: F.prettyService,
      today: F.manilaToday(),
    });
  } catch (e) {
    next(e);
  }
});

// ---- UPDATE STATUS  POST /appointments/:id/status --------------------------
router.post("/appointments/:id/status", async (req, res, next) => {
  try {
    if (!STATUSES.includes(req.body.status)) return res.status(400).send("Invalid status.");
    await db.query(
      "UPDATE appointments SET status=$1, updated_at=now() WHERE appointment_id=$2",
      [req.body.status, req.params.id]
    );
    // Only allow local redirects (no open-redirect via the `back` field).
    const back = req.body.back || "";
    const safe = back.startsWith("/") && !back.startsWith("//") ? back : "/appointments";
    res.redirect(safe);
  } catch (e) {
    next(e);
  }
});

// ---- UPDATE (reschedule)  POST /appointments/:id ---------------------------
router.post("/appointments/:id", async (req, res, next) => {
  try {
    const services = await loadServices();
    const { errors, value } = validateAppt(req.body, services);

    if (!errors.length) {
      const dup = await db.query(
        `SELECT 1 FROM appointments
          WHERE patient_id=$1 AND service_id=$2 AND appointment_date=$3
            AND status='scheduled' AND appointment_id<>$4`,
        [value.patient_id, value.service_id, value.date, req.params.id]
      );
      if (dup.rowCount)
        errors.push("This patient is already booked for this service on that date.");
    }
    if (errors.length)
      return rerenderForm(res, {
        mode: "edit",
        body: req.body,
        services,
        errors,
        appointment_id: req.params.id,
      });

    const { rowCount } = await db.query(
      `UPDATE appointments
          SET service_id=$1, appointment_date=$2, appointment_time=$3, notes=$4, updated_at=now()
        WHERE appointment_id=$5`,
      [value.service_id, value.date, value.time, value.notes, req.params.id]
    );
    if (!rowCount) return next();
    // Instant "rescheduled" email — fire-and-forget.
    sendBookingConfirmation(req.params.id, "rescheduled")
      .catch((e) => console.error("[confirmation email]", e.message));
    res.redirect(`/appointments?date=${value.date}`);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
