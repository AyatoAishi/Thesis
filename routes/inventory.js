// ============================================================================
// routes/inventory.js — medicine stock + dispensing with doctor approval (M6)
// Behind requireLogin (mounted after the gate in server.js); only the
// approve/reject actions are further gated to the doctor role.
//
// Design notes:
//   - `requires_doctor_approval` lives on the MEDICINE (not chosen per-dispense
//     by whoever is dispensing — that would let the safeguard be bypassed by
//     just unchecking a box). It's copied onto the dispense row at creation
//     time so history stays accurate even if the medicine's flag changes later.
//   - Stock is only subtracted when a dispense actually completes: immediately
//     for medicines that don't need approval, or at the moment a doctor
//     approves one that does. A pending request never touches stock_quantity,
//     so the shelf count always matches what has truly left the shelf.
//   - Both the stock-check and the subtract happen in one DB transaction
//     (db.getClient) with a conditional UPDATE ... WHERE stock_quantity >= $n,
//     so two concurrent dispenses can't push stock negative.
// ============================================================================
const express = require("express");
const db = require("../db");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

// ---- helpers ----------------------------------------------------------------
function toInt(v, def) {
  if (v === "" || v === undefined || v === null) return def;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
}

function readMedicineForm(body) {
  return {
    name: (body.name || "").trim(),
    description: (body.description || "").trim() || null,
    unit: (body.unit || "").trim() || null,
    stock_quantity: toInt(body.stock_quantity, 0),
    low_stock_threshold: toInt(body.low_stock_threshold, 10),
    source: (body.source || "").trim() || null,
    requires_doctor_approval: body.requires_doctor_approval === "on" || body.requires_doctor_approval === "true",
  };
}

function validateMedicine(m) {
  const errors = [];
  if (!m.name) errors.push("Medicine name is required.");
  if (!Number.isInteger(m.stock_quantity) || m.stock_quantity < 0)
    errors.push("Stock quantity must be zero or a positive whole number.");
  if (!Number.isInteger(m.low_stock_threshold) || m.low_stock_threshold < 0)
    errors.push("Low-stock threshold must be zero or a positive whole number.");
  return errors;
}

// Validate a submitted dispense. `medicine` may be null (not chosen / not found).
function validateDispense(body, medicine) {
  const errors = [];
  const patient_id = parseInt(body.patient_id, 10) || null;
  const quantity = parseInt(body.quantity, 10) || null;
  const notes = (body.notes || "").trim().slice(0, 255) || null;
  if (!patient_id) errors.push("Choose a patient.");
  if (!quantity || quantity <= 0) errors.push("Enter a quantity greater than zero.");
  if (medicine && quantity && quantity > medicine.stock_quantity)
    errors.push(`Only ${medicine.stock_quantity} ${medicine.unit || "unit(s)"} of ${medicine.name} left in stock.`);
  return { errors, value: { patient_id, quantity, notes } };
}

// Local-redirect-only (no open-redirect via a `back` form field), optionally
// carrying a flash message — same convention as appointments.js/portal.js.
function safeRedirect(res, back, fallback, flash) {
  const safe = back && back.startsWith("/") && !back.startsWith("//") ? back : fallback;
  const sep = safe.includes("?") ? "&" : "?";
  res.redirect(flash ? `${safe}${sep}flash=${encodeURIComponent(flash)}` : safe);
}

// Re-render the dispense form after a validation failure (keeps user input,
// reloads whichever dropdown — patient and/or medicine — wasn't preselected).
async function rerenderDispenseForm(res, { body, medicine, errors }) {
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
      await db.query("SELECT patient_id, patient_number, full_name FROM patients ORDER BY full_name LIMIT 500")
    ).rows;
  }
  const medicines = medicine
    ? null
    : (
        await db.query(
          "SELECT medicine_id, name, unit, stock_quantity FROM medicines ORDER BY name LIMIT 500"
        )
      ).rows;
  return res.status(400).render("inventory/dispense-form", {
    title: "Dispense medicine · Sampaguita HC",
    active: "inventory",
    dispense: { ...body },
    medicine,
    medicines,
    patient,
    patients,
    errors,
  });
}

// ---- LIST  GET /inventory  (search + low-stock filter + summary pills) ----
router.get("/inventory", async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    const lowOnly = req.query.low === "1";
    const conds = [];
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      conds.push(`name ILIKE $${params.length}`);
    }
    if (lowOnly) conds.push("stock_quantity < low_stock_threshold");
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

    const [{ rows }, totalQ, lowQ, pendingQ] = await Promise.all([
      db.query(
        `SELECT medicine_id, name, description, unit, stock_quantity, low_stock_threshold,
                source, requires_doctor_approval
           FROM medicines ${where}
          ORDER BY name LIMIT 500`,
        params
      ),
      db.query("SELECT count(*)::int n FROM medicines"),
      db.query("SELECT count(*)::int n FROM medicines WHERE stock_quantity < low_stock_threshold"),
      db.query(
        "SELECT count(*)::int n FROM medicine_dispenses WHERE requires_doctor_approval=true AND approved_at IS NULL"
      ),
    ]);

    res.render("inventory/list", {
      title: "Inventory · Sampaguita HC",
      active: "inventory",
      medicines: rows,
      q,
      lowOnly,
      total: totalQ.rows[0].n,
      lowCount: lowQ.rows[0].n,
      pendingCount: pendingQ.rows[0].n,
      flash: req.query.flash || null,
    });
  } catch (e) {
    next(e);
  }
});

// ---- NEW form  GET /inventory/new ------------------------------------------
router.get("/inventory/new", (req, res) => {
  res.render("inventory/form", {
    title: "Add medicine · Sampaguita HC",
    active: "inventory",
    mode: "new",
    medicine: {},
    errors: [],
  });
});

// ---- CREATE  POST /inventory ------------------------------------------------
router.post("/inventory", async (req, res, next) => {
  const m = readMedicineForm(req.body);
  const errors = validateMedicine(m);
  if (errors.length) {
    return res.status(400).render("inventory/form", {
      title: "Add medicine · Sampaguita HC",
      active: "inventory",
      mode: "new",
      medicine: m,
      errors,
    });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO medicines
         (name, description, unit, stock_quantity, low_stock_threshold, source, requires_doctor_approval)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING medicine_id`,
      [m.name, m.description, m.unit, m.stock_quantity, m.low_stock_threshold, m.source, m.requires_doctor_approval]
    );
    res.redirect(`/inventory/${rows[0].medicine_id}`);
  } catch (e) {
    next(e);
  }
});

// ---- DISPENSE QUEUE/HISTORY  GET /inventory/dispenses ----------------------
router.get("/inventory/dispenses", async (req, res, next) => {
  try {
    const statuses = ["pending", "approved", "completed", "all"];
    const status = statuses.includes(req.query.status) ? req.query.status : "pending";
    const where =
      status === "pending"
        ? "d.requires_doctor_approval=true AND d.approved_at IS NULL"
        : status === "approved"
        ? "d.requires_doctor_approval=true AND d.approved_at IS NOT NULL"
        : status === "completed"
        ? "d.requires_doctor_approval=false"
        : "TRUE";

    const [{ rows }, pendingQ] = await Promise.all([
      db.query(
        `SELECT d.dispense_id, d.quantity, d.dispensed_at, d.requires_doctor_approval, d.approved_at, d.notes,
                m.medicine_id, m.name AS medicine_name, m.unit,
                p.patient_id, p.patient_number, p.full_name,
                du.full_name AS dispensed_by_name, au.full_name AS approved_by_name
           FROM medicine_dispenses d
           JOIN medicines m ON m.medicine_id = d.medicine_id
           JOIN patients  p ON p.patient_id  = d.patient_id
           LEFT JOIN users du ON du.user_id = d.dispensed_by
           LEFT JOIN users au ON au.user_id = d.approved_by
          WHERE ${where}
          ORDER BY d.dispensed_at DESC
          LIMIT 300`
      ),
      db.query(
        "SELECT count(*)::int n FROM medicine_dispenses WHERE requires_doctor_approval=true AND approved_at IS NULL"
      ),
    ]);

    res.render("inventory/dispenses", {
      title: "Dispenses · Sampaguita HC",
      active: "inventory",
      rows,
      status,
      pendingCount: pendingQ.rows[0].n,
      isDoctor: req.session.user.role === "doctor",
      flash: req.query.flash || null,
    });
  } catch (e) {
    next(e);
  }
});

// ---- DISPENSE form  GET /inventory/dispense/new ----------------------------
router.get("/inventory/dispense/new", async (req, res, next) => {
  try {
    let patient = null;
    let patients = null;
    if (req.query.patient_id) {
      const r = await db.query(
        "SELECT patient_id, patient_number, full_name FROM patients WHERE patient_id=$1",
        [parseInt(req.query.patient_id, 10) || 0]
      );
      patient = r.rows[0] || null;
    }
    if (!patient) {
      patients = (
        await db.query("SELECT patient_id, patient_number, full_name FROM patients ORDER BY full_name LIMIT 500")
      ).rows;
    }

    let medicine = null;
    let medicines = null;
    if (req.query.medicine_id) {
      const r = await db.query("SELECT * FROM medicines WHERE medicine_id=$1", [
        parseInt(req.query.medicine_id, 10) || 0,
      ]);
      medicine = r.rows[0] || null;
    }
    if (!medicine) {
      medicines = (
        await db.query("SELECT medicine_id, name, unit, stock_quantity FROM medicines ORDER BY name LIMIT 500")
      ).rows;
    }

    res.render("inventory/dispense-form", {
      title: "Dispense medicine · Sampaguita HC",
      active: "inventory",
      dispense: {},
      medicine,
      medicines,
      patient,
      patients,
      errors: [],
    });
  } catch (e) {
    next(e);
  }
});

// ---- CREATE DISPENSE  POST /inventory/dispense -----------------------------
router.post("/inventory/dispense", async (req, res, next) => {
  try {
    const medicine_id = parseInt(req.body.medicine_id, 10) || null;
    const medQ = medicine_id
      ? await db.query("SELECT * FROM medicines WHERE medicine_id=$1", [medicine_id])
      : { rows: [] };
    const medicine = medQ.rows[0] || null;

    const { errors: valErrors, value } = validateDispense(req.body, medicine);
    const errors = medicine ? valErrors : ["Choose a medicine.", ...valErrors];
    if (errors.length) return rerenderDispenseForm(res, { body: req.body, medicine, errors });

    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      if (medicine.requires_doctor_approval) {
        // Just record the request — stock isn't touched until a doctor approves.
        await client.query(
          `INSERT INTO medicine_dispenses
             (patient_id, medicine_id, quantity, dispensed_by, requires_doctor_approval, notes)
           VALUES ($1,$2,$3,$4,true,$5)`,
          [value.patient_id, medicine.medicine_id, value.quantity, req.session.user.user_id, value.notes]
        );
        await client.query("COMMIT");
        return safeRedirect(
          res,
          null,
          `/inventory/${medicine.medicine_id}`,
          "Dispense recorded — pending doctor approval before stock is deducted."
        );
      }

      const upd = await client.query(
        `UPDATE medicines SET stock_quantity = stock_quantity - $1, updated_at = now()
          WHERE medicine_id = $2 AND stock_quantity >= $1`,
        [value.quantity, medicine.medicine_id]
      );
      if (!upd.rowCount) {
        await client.query("ROLLBACK");
        return rerenderDispenseForm(res, {
          body: req.body,
          medicine,
          errors: [`Only ${medicine.stock_quantity} ${medicine.unit || "unit(s)"} left — someone else may have just dispensed some. Refresh and try again.`],
        });
      }
      await client.query(
        `INSERT INTO medicine_dispenses
           (patient_id, medicine_id, quantity, dispensed_by, requires_doctor_approval, notes)
         VALUES ($1,$2,$3,$4,false,$5)`,
        [value.patient_id, medicine.medicine_id, value.quantity, req.session.user.user_id, value.notes]
      );
      await client.query("COMMIT");
      safeRedirect(res, null, `/inventory/${medicine.medicine_id}`, "Medicine dispensed and stock updated.");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    next(e);
  }
});

// ---- APPROVE pending dispense  POST /inventory/dispense/:id/approve -------
router.post("/inventory/dispense/:id/approve", requireRole("doctor"), async (req, res, next) => {
  const client = await db.getClient();
  try {
    await client.query("BEGIN");
    const dQ = await client.query(
      `SELECT dispense_id, medicine_id, quantity FROM medicine_dispenses
        WHERE dispense_id=$1 AND requires_doctor_approval=true AND approved_at IS NULL
        FOR UPDATE`,
      [req.params.id]
    );
    if (!dQ.rowCount) {
      await client.query("ROLLBACK");
      return safeRedirect(res, req.body.back, "/inventory/dispenses", "That dispense is no longer pending.");
    }
    const d = dQ.rows[0];
    const upd = await client.query(
      `UPDATE medicines SET stock_quantity = stock_quantity - $1, updated_at = now()
        WHERE medicine_id=$2 AND stock_quantity >= $1`,
      [d.quantity, d.medicine_id]
    );
    if (!upd.rowCount) {
      await client.query("ROLLBACK");
      return safeRedirect(res, req.body.back, "/inventory/dispenses", "Not enough stock left to approve this dispense.");
    }
    await client.query(
      `UPDATE medicine_dispenses SET approved_by=$1, approved_at=now() WHERE dispense_id=$2`,
      [req.session.user.user_id, req.params.id]
    );
    await client.query("COMMIT");
    safeRedirect(res, req.body.back, "/inventory/dispenses", "Dispense approved — stock updated.");
  } catch (e) {
    await client.query("ROLLBACK");
    next(e);
  } finally {
    client.release();
  }
});

// ---- REJECT pending dispense  POST /inventory/dispense/:id/reject ---------
// Stock was never touched for a pending request, so rejecting is just removing
// the request — nothing to roll back.
router.post("/inventory/dispense/:id/reject", requireRole("doctor"), async (req, res, next) => {
  try {
    const { rowCount } = await db.query(
      `DELETE FROM medicine_dispenses
        WHERE dispense_id=$1 AND requires_doctor_approval=true AND approved_at IS NULL`,
      [req.params.id]
    );
    safeRedirect(
      res,
      req.body.back,
      "/inventory/dispenses",
      rowCount ? "Pending dispense rejected." : "That dispense is no longer pending."
    );
  } catch (e) {
    next(e);
  }
});

// ---- VIEW  GET /inventory/:id ----------------------------------------------
router.get("/inventory/:id", async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT * FROM medicines WHERE medicine_id=$1", [req.params.id]);
    if (!rows[0]) return next();

    const { rows: dispenses } = await db.query(
      `SELECT d.dispense_id, d.quantity, d.dispensed_at, d.requires_doctor_approval, d.approved_at, d.notes,
              p.patient_id, p.patient_number, p.full_name,
              du.full_name AS dispensed_by_name, au.full_name AS approved_by_name
         FROM medicine_dispenses d
         JOIN patients p ON p.patient_id = d.patient_id
         LEFT JOIN users du ON du.user_id = d.dispensed_by
         LEFT JOIN users au ON au.user_id = d.approved_by
        WHERE d.medicine_id = $1
        ORDER BY d.dispensed_at DESC
        LIMIT 50`,
      [req.params.id]
    );

    res.render("inventory/view", {
      title: `${rows[0].name} · Sampaguita HC`,
      active: "inventory",
      medicine: rows[0],
      dispenses,
      flash: req.query.flash || null,
    });
  } catch (e) {
    next(e);
  }
});

// ---- EDIT form  GET /inventory/:id/edit ------------------------------------
router.get("/inventory/:id/edit", async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT * FROM medicines WHERE medicine_id=$1", [req.params.id]);
    if (!rows[0]) return next();
    res.render("inventory/form", {
      title: "Edit medicine · Sampaguita HC",
      active: "inventory",
      mode: "edit",
      medicine: rows[0],
      errors: [],
    });
  } catch (e) {
    next(e);
  }
});

// ---- UPDATE  POST /inventory/:id -------------------------------------------
router.post("/inventory/:id", async (req, res, next) => {
  const m = readMedicineForm(req.body);
  const errors = validateMedicine(m);
  if (errors.length) {
    return res.status(400).render("inventory/form", {
      title: "Edit medicine · Sampaguita HC",
      active: "inventory",
      mode: "edit",
      medicine: { ...m, medicine_id: req.params.id },
      errors,
    });
  }
  try {
    const { rowCount } = await db.query(
      `UPDATE medicines SET
         name=$1, description=$2, unit=$3, stock_quantity=$4, low_stock_threshold=$5,
         source=$6, requires_doctor_approval=$7, updated_at=now()
       WHERE medicine_id=$8`,
      [m.name, m.description, m.unit, m.stock_quantity, m.low_stock_threshold, m.source, m.requires_doctor_approval, req.params.id]
    );
    if (!rowCount) return next();
    res.redirect(`/inventory/${req.params.id}`);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
