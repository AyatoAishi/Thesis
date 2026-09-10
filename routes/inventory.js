// ============================================================================
// routes/inventory.js — medicine stock + dispensing (M6)
// Behind requireLogin (mounted after the gate in server.js).
//
// The doctor-approval step was removed on 2026-08-20. There is no doctor at
// this clinic — the staff confirmed it — so every controlled-medicine request
// sat in a queue waiting for someone who was never going to come. One had been
// waiting since the day the system launched. A safeguard that cannot fire is
// not a safeguard; it is a medicine that never reaches the patient.
//
// Design notes:
//   - Stock is subtracted the moment a dispense is recorded, because that is
//     the moment the medicine leaves the shelf.
//   - The stock-check and the subtract happen in one DB transaction
//     (db.getClient) with a conditional UPDATE ... WHERE stock_quantity >= $n,
//     so two concurrent dispenses can't push stock negative.
//   - medicine_dispenses.requires_doctor_approval / approved_by / approved_at
//     remain in the schema and are left untouched on old rows. They record how
//     those dispenses were actually handled at the time, and rewriting history
//     to match today's workflow would be a lie.
// ============================================================================
const express = require("express");
const db = require("../db");
const audit = require("../lib/audit");

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
    dosage: (body.dosage || "").trim() || null,
    stock_quantity: toInt(body.stock_quantity, 0),
    low_stock_threshold: toInt(body.low_stock_threshold, 10),
    source: (body.source || "").trim() || null,
    is_family_planning: body.is_family_planning === "on" || body.is_family_planning === "true",
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
// A form field repeated N times arrives as an array — except when N is 1,
// where Express hands back a bare string. Every read of these has to go
// through here or one-medicine dispensing breaks in a way that two-medicine
// dispensing does not, which is a horrible bug to be handed.
const asArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

// One patient, one note, and a list of medicines. Alyanna: "Can add more
// medicines para d paisa isa" — somebody leaving with three medicines used to
// mean filling this form three times and picking the same patient each time.
function validateDispense(body, medicines) {
  const errors = [];
  const patient_id = parseInt(body.patient_id, 10) || null;
  const notes = (body.notes || "").trim().slice(0, 255) || null;
  if (!patient_id) errors.push("Choose a patient.");

  const ids = asArray(body.line_medicine_id);
  const qtys = asArray(body.line_quantity);
  const byId = new Map((medicines || []).map((m) => [m.medicine_id, m]));

  const lines = [];
  const seen = new Map();
  ids.forEach((rawId, i) => {
    const medicine_id = parseInt(rawId, 10) || null;
    const quantity = parseInt(qtys[i], 10) || null;
    // A row left completely blank is somebody who pressed "add" and changed
    // their mind. Dropped quietly rather than turned into an error.
    if (!medicine_id && !quantity) return;
    lines.push({ medicine_id, quantity });

    const where = ids.length > 1 ? ` (row ${lines.length})` : "";
    const med = byId.get(medicine_id);
    if (!medicine_id) return errors.push(`Choose a medicine${where}.`);
    if (!med) return errors.push(`That medicine is no longer in the inventory${where}.`);
    if (!quantity || quantity <= 0)
      return errors.push(`Enter a quantity greater than zero for ${med.name}${where}.`);

    // The same medicine twice would pass each line's own stock check and
    // together ask for more than exists, so the totals are what get checked.
    seen.set(medicine_id, (seen.get(medicine_id) || 0) + quantity);
  });

  if (!lines.length) errors.push("Add at least one medicine.");

  for (const [medicine_id, total] of seen) {
    const med = byId.get(medicine_id);
    if (med && total > med.stock_quantity) {
      const twice = lines.filter((l) => l.medicine_id === medicine_id).length > 1;
      errors.push(
        `Only ${med.stock_quantity} ${med.unit || "unit(s)"} of ${med.name} left in stock` +
        (twice ? `, and the rows above ask for ${total} between them.` : ".")
      );
    }
  }

  return { errors, value: { patient_id, notes, lines } };
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
  // The medicine list is always needed now: every line is its own dropdown, so
  // there is no longer a "one medicine already chosen" case that could skip it.
  const medicines = (
    await db.query(
      "SELECT medicine_id, name, unit, dosage, stock_quantity FROM medicines ORDER BY name LIMIT 500"
    )
  ).rows;

  // Hand the rows back exactly as they were typed. Retyping four medicines
  // because the fourth one was short by two boxes is the kind of thing that
  // makes people stop using a form and go back to paper.
  const ids = asArray(body.line_medicine_id);
  const qtys = asArray(body.line_quantity);
  const lines = ids.map((id, i) => ({ medicine_id: id, quantity: qtys[i] }));

  return res.status(400).render("inventory/dispense-form", {
    title: "Dispense medicine · Sampaguita HC",
    active: "inventory",
    dispense: { ...body },
    medicine: medicine || null,
    medicines,
    patient,
    patients,
    lines,
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

    const [{ rows }, totalQ, lowQ] = await Promise.all([
      db.query(
        `SELECT medicine_id, name, description, unit, dosage, stock_quantity, low_stock_threshold,
                source, is_family_planning
           FROM medicines ${where}
          ORDER BY name LIMIT 500`,
        params
      ),
      db.query("SELECT count(*)::int n FROM medicines"),
      db.query("SELECT count(*)::int n FROM medicines WHERE stock_quantity < low_stock_threshold"),
    ]);

    res.render("inventory/list", {
      title: "Inventory · Sampaguita HC",
      active: "inventory",
      medicines: rows,
      q,
      lowOnly,
      total: totalQ.rows[0].n,
      lowCount: lowQ.rows[0].n,
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

// Same name + same dosage (case-insensitive, blank dosage treated as its own
// value) already exists → treat as a duplicate. Different dosage of the same
// name is a distinct medicine and is allowed. `excludeId` skips a row's own
// id, so editing a medicine doesn't flag itself as a duplicate of itself.
async function findDuplicateMedicine(m, excludeId) {
  const { rows } = await db.query(
    `SELECT medicine_id, name, dosage FROM medicines
      WHERE lower(name) = lower($1)
        AND lower(coalesce(dosage,'')) = lower(coalesce($2,''))
        AND medicine_id <> coalesce($3, -1)
      LIMIT 1`,
    [m.name, m.dosage, excludeId || null]
  );
  return rows[0] || null;
}

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
    const dup = await findDuplicateMedicine(m);
    if (dup) {
      return res.status(400).render("inventory/form", {
        title: "Add medicine · Sampaguita HC",
        active: "inventory",
        mode: "new",
        medicine: m,
        errors: [
          `"${dup.name}"${dup.dosage ? ` (${dup.dosage})` : ""} already exists in inventory. ` +
            `Open it and adjust its stock quantity instead of adding a duplicate entry.`,
        ],
        dupId: dup.medicine_id,
      });
    }
    const { rows } = await db.query(
      `INSERT INTO medicines
         (name, description, unit, dosage, stock_quantity, low_stock_threshold, source, is_family_planning)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING medicine_id`,
      [m.name, m.description, m.unit, m.dosage, m.stock_quantity, m.low_stock_threshold, m.source, m.is_family_planning]
    );
    audit.log(
      req.session.user.user_id, "create", "medicine", rows[0].medicine_id,
      `${m.name} added with stock ${m.stock_quantity}`
    );
    res.redirect(`/inventory/${rows[0].medicine_id}`);
  } catch (e) {
    next(e);
  }
});

// ---- DISPENSE QUEUE/HISTORY  GET /inventory/dispenses ----------------------
router.get("/inventory/dispenses", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT d.dispense_id, d.quantity, d.dispensed_at, d.notes,
              m.medicine_id, m.name AS medicine_name, m.unit,
              p.patient_id, p.patient_number, p.full_name,
              du.full_name AS dispensed_by_name
         FROM medicine_dispenses d
         JOIN medicines m ON m.medicine_id = d.medicine_id
         JOIN patients  p ON p.patient_id  = d.patient_id
         LEFT JOIN users du ON du.user_id = d.dispensed_by
        ORDER BY d.dispensed_at DESC
        LIMIT 300`
    );

    res.render("inventory/dispenses", {
      title: "Dispenses · Sampaguita HC",
      active: "inventory",
      rows,
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
    // Always loaded: every line on the form is its own dropdown now, so even
    // arriving from one medicine's page (which pre-selects the first row) the
    // rest of the list is needed for the rows the person may add.
    {
      medicines = (
        await db.query("SELECT medicine_id, name, unit, dosage, stock_quantity FROM medicines ORDER BY name LIMIT 500")
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
    const all = (await db.query("SELECT * FROM medicines ORDER BY name")).rows;
    const { errors, value } = validateDispense(req.body, all);
    if (errors.length) return rerenderDispenseForm(res, { body: req.body, errors });

    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      // All of it or none of it. Handing somebody two of their three medicines
      // and telling them the third failed leaves the stock count right and the
      // patient's record wrong, and nobody would ever notice which line was
      // missing. The conditional UPDATE is still the real guard: two staff at
      // two desks dispensing the last box at the same moment is exactly the
      // race this catches, because the row is locked by the first one to
      // reach it.
      for (const line of value.lines) {
        const med = all.find((m) => m.medicine_id === line.medicine_id);
        const upd = await client.query(
          `UPDATE medicines SET stock_quantity = stock_quantity - $1, updated_at = now()
            WHERE medicine_id = $2 AND stock_quantity >= $1`,
          [line.quantity, line.medicine_id]
        );
        if (!upd.rowCount) {
          await client.query("ROLLBACK");
          return rerenderDispenseForm(res, {
            body: req.body,
            errors: [
              `${med ? med.name : "That medicine"} ran out while this form was open — ` +
              "somebody else may have just dispensed some. Nothing was dispensed. " +
              "Refresh to see the current stock and try again.",
            ],
          });
        }
        // One row per medicine, not one per basket: the dispense history, the
        // consumption report and the patient's own portal all read this table
        // per medicine, and none of them would survive a combined row.
        await client.query(
          `INSERT INTO medicine_dispenses
             (patient_id, medicine_id, quantity, dispensed_by, notes)
           VALUES ($1,$2,$3,$4,$5)`,
          [value.patient_id, line.medicine_id, line.quantity, req.session.user.user_id, value.notes]
        );
      }

      await client.query("COMMIT");

      const n = value.lines.length;
      safeRedirect(res, null, "/inventory/dispenses",
        n === 1 ? "Medicine dispensed and stock updated."
                : `${n} medicines dispensed and stock updated.`);
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

// ---- VIEW  GET /inventory/:id ----------------------------------------------
router.get("/inventory/:id", async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT * FROM medicines WHERE medicine_id=$1", [req.params.id]);
    if (!rows[0]) return next();

    const { rows: dispenses } = await db.query(
      `SELECT d.dispense_id, d.quantity, d.dispensed_at, d.notes,
              p.patient_id, p.patient_number, p.full_name,
              du.full_name AS dispensed_by_name
         FROM medicine_dispenses d
         JOIN patients p ON p.patient_id = d.patient_id
         LEFT JOIN users du ON du.user_id = d.dispensed_by
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
    const dup = await findDuplicateMedicine(m, parseInt(req.params.id, 10));
    if (dup) {
      return res.status(400).render("inventory/form", {
        title: "Edit medicine · Sampaguita HC",
        active: "inventory",
        mode: "edit",
        medicine: { ...m, medicine_id: req.params.id },
        errors: [
          `"${dup.name}"${dup.dosage ? ` (${dup.dosage})` : ""} already exists as a separate entry — ` +
            `merge stock there instead of having two entries for the same medicine.`,
        ],
      });
    }
    // This form carries stock_quantity as a plain number and writes it back
    // whole, which quietly undid real dispenses: open the edit page while stock
    // is 59, someone dispenses 10 in the next room, then fix a typo in the
    // dosage and save — stock jumps back to 59 and the 10 units that physically
    // left the shelf are restored on paper. Nobody saw an error.
    //
    // So the save is refused if the row changed after this form was loaded.
    // `seen_at` is the updated_at the form was rendered with; it is compared
    // inside the UPDATE, so the check and the write are the same statement and
    // nothing can slip between them.
    // Compared at millisecond precision, not exactly. Postgres keeps
    // microseconds (…914905) and a JavaScript Date only holds milliseconds
    // (…914), so a plain `updated_at = $11` never matches its own value and
    // would reject every save, not just the stale ones. Two saves inside the
    // same millisecond would slip through — that is a human clicking a form,
    // so it isn't reachable in practice.
    const seenAt = Date.parse(req.body.seen_at || "");
    const guarded = Number.isFinite(seenAt);
    const { rowCount } = await db.query(
      `UPDATE medicines SET
         name=$1, description=$2, unit=$3, dosage=$4, stock_quantity=$5, low_stock_threshold=$6,
         source=$7, is_family_planning=$8, updated_at=now()
       WHERE medicine_id=$9 ${guarded ? "AND date_trunc('milliseconds', updated_at) = $10" : ""}`,
      [m.name, m.description, m.unit, m.dosage, m.stock_quantity, m.low_stock_threshold,
       m.source, m.is_family_planning, req.params.id,
       ...(guarded ? [new Date(seenAt)] : [])]
    );

    if (!rowCount) {
      // Either the medicine is gone, or someone else changed it first.
      const still = await db.query("SELECT * FROM medicines WHERE medicine_id=$1", [req.params.id]);
      if (!still.rows[0]) return next();
      return res.status(409).render("inventory/form", {
        title: "Edit medicine · Sampaguita HC",
        active: "inventory",
        mode: "edit",
        medicine: still.rows[0],   // redraw with the CURRENT numbers, not theirs
        errors: [
          `Someone else changed "${still.rows[0].name}" while this page was open — most likely a dispense. ` +
            `Nothing was saved. The current values are shown below; make your change again on top of them.`,
        ],
      });
    }

    audit.log(
      req.session.user.user_id, "update", "medicine", req.params.id,
      `${m.name} — stock set to ${m.stock_quantity}`
    );
    res.redirect(`/inventory/${req.params.id}`);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
