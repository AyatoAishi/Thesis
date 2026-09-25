// ============================================================================
// lib/stock.js — every change to a medicine's stock goes through here.
//
// THE INVARIANT: medicines.stock_quantity == sum(medicine_batches.quantity_remaining)
// for that medicine, always. stock_quantity is USABLE stock — not expired, not
// disposed. Each function below changes a batch and the medicine's total in
// the SAME transaction and writes one row to stock_movements saying what
// happened, so the ledger and the numbers can never disagree about the past.
//
// Nothing else in the codebase may write stock_quantity. The edit form no
// longer carries it; dispensing calls allocate(); a delivery calls restock().
//
// EXPIRY. A batch is usable up to and including its expiry date, and expired
// from the next day. expireDue() moves those units out of usable stock into
// expired_quantity, where they wait until somebody physically disposes of them
// and records it. It is idempotent and cheap when nothing is due, so it runs
// wherever the answer matters — the inventory page, every dispense, the daily
// job — rather than trusting one schedule to have fired.
//
// FEFO. Dispensing takes from the batch that expires soonest (blank expiry
// last), so older stock is used before it goes to waste.
// ============================================================================
const db = require("../db");
const F = require("./format");

const EXPIRING_SOON_DAYS = 30;

// Run a function inside a transaction, or inside the caller's if one is given.
async function inTx(client, fn) {
  if (client) return fn(client);
  const c = await db.getClient();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

async function record(c, { medicineId, batchId = null, dispenseId = null, kind, quantity, delta, note = null, userId = null }) {
  const { rows } = await c.query("SELECT stock_quantity FROM medicines WHERE medicine_id=$1", [medicineId]);
  await c.query(
    `INSERT INTO stock_movements (medicine_id, batch_id, dispense_id, kind, quantity, stock_delta, stock_after, note, by_user)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [medicineId, batchId, dispenseId, kind, quantity, delta, rows[0].stock_quantity, note ? String(note).slice(0, 255) : null, userId]
  );
}

// ---- expiry ------------------------------------------------------------------
async function expireDue({ client = null, today = F.manilaToday() } = {}) {
  // Cheap check first: on the vast majority of calls nothing is due, and this
  // should cost one indexed read, not a transaction.
  const probe = await (client || db).query(
    `SELECT 1 FROM medicine_batches
      WHERE quantity_remaining > 0 AND expiry_date IS NOT NULL AND expiry_date < $1::date
      LIMIT 1`,
    [today]
  );
  if (!probe.rowCount) return 0;

  return inTx(client, async (c) => {
    const { rows } = await c.query(
      `SELECT batch_id, medicine_id, quantity_remaining, expiry_date
         FROM medicine_batches
        WHERE quantity_remaining > 0 AND expiry_date IS NOT NULL AND expiry_date < $1::date
        ORDER BY medicine_id
        FOR UPDATE`,
      [today]
    );
    for (const b of rows) {
      await c.query(
        `UPDATE medicine_batches
            SET expired_quantity = expired_quantity + quantity_remaining,
                quantity_remaining = 0,
                expired_at = coalesce(expired_at, now())
          WHERE batch_id = $1`,
        [b.batch_id]
      );
      await c.query(
        "UPDATE medicines SET stock_quantity = stock_quantity - $1, updated_at = now() WHERE medicine_id = $2",
        [b.quantity_remaining, b.medicine_id]
      );
      await record(c, {
        medicineId: b.medicine_id, batchId: b.batch_id, kind: "expire",
        quantity: b.quantity_remaining, delta: -b.quantity_remaining,
        note: `Expired ${String(b.expiry_date instanceof Date ? b.expiry_date.toISOString() : b.expiry_date).slice(0, 10)} — moved out of usable stock`,
      });
    }
    return rows.length;
  });
}

// ---- a delivery ----------------------------------------------------------------
async function restock({ client = null, medicineId, quantity, expiryDate = null, source = null, note = null, userId = null, kind = "restock" }) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Restock quantity must be a positive whole number.");
  return inTx(client, async (c) => {
    const { rows } = await c.query(
      `INSERT INTO medicine_batches (medicine_id, quantity_received, quantity_remaining, expiry_date, source, note, received_by)
       VALUES ($1,$2,$2,$3,$4,$5,$6) RETURNING batch_id`,
      [medicineId, quantity, expiryDate || null, source || null, note || null, userId]
    );
    await c.query(
      "UPDATE medicines SET stock_quantity = stock_quantity + $1, updated_at = now() WHERE medicine_id = $2",
      [quantity, medicineId]
    );
    await record(c, {
      medicineId, batchId: rows[0].batch_id, kind, quantity, delta: quantity, userId,
      note: [expiryDate ? `expires ${expiryDate}` : "no expiry recorded", source ? `from ${source}` : null, note].filter(Boolean).join(" · "),
    });
    return rows[0].batch_id;
  });
}

// ---- dispensing: first-expiry, first-out ---------------------------------------
// Must be called inside the dispense transaction (client required). Takes
// `quantity` units of one medicine from its usable batches, soonest expiry
// first, and returns which batches gave how much. Returns null — having
// changed nothing — if the usable batches cannot cover it; the caller rolls
// back the whole basket, as it already did for a stock shortage.
async function allocate(client, { medicineId, quantity, dispenseId = null, userId = null, today = F.manilaToday() }) {
  const { rows } = await client.query(
    `SELECT batch_id, quantity_remaining, expiry_date
       FROM medicine_batches
      WHERE medicine_id = $1 AND quantity_remaining > 0
        AND (expiry_date IS NULL OR expiry_date >= $2::date)
      ORDER BY expiry_date NULLS LAST, received_at, batch_id
      FOR UPDATE`,
    [medicineId, today]
  );
  const available = rows.reduce((n, b) => n + b.quantity_remaining, 0);
  if (available < quantity) return null;

  let left = quantity;
  const taken = [];
  for (const b of rows) {
    if (!left) break;
    const take = Math.min(left, b.quantity_remaining);
    await client.query(
      "UPDATE medicine_batches SET quantity_remaining = quantity_remaining - $1 WHERE batch_id = $2",
      [take, b.batch_id]
    );
    taken.push({ batchId: b.batch_id, quantity: take });
    left -= take;
  }
  // The conditional UPDATE stays as the last guard: if the total somehow does
  // not cover it, nothing is written and the caller rolls back.
  const upd = await client.query(
    `UPDATE medicines SET stock_quantity = stock_quantity - $1, updated_at = now()
      WHERE medicine_id = $2 AND stock_quantity >= $1`,
    [quantity, medicineId]
  );
  if (!upd.rowCount) return null;
  for (const t of taken) {
    await record(client, {
      medicineId, batchId: t.batchId, dispenseId, kind: "dispense",
      quantity: t.quantity, delta: -t.quantity, userId,
    });
  }
  return taken;
}

// ---- a physical count that disagrees with the system ---------------------------
async function correctBatch({ batchId, newRemaining, reason, userId }) {
  if (!Number.isInteger(newRemaining) || newRemaining < 0) throw new Error("The counted quantity must be zero or more.");
  if (!reason || !String(reason).trim()) throw new Error("Say why the count changed.");
  return inTx(null, async (c) => {
    const { rows } = await c.query(
      `SELECT batch_id, medicine_id, quantity_remaining, disposed_at, expired_at
         FROM medicine_batches WHERE batch_id = $1 FOR UPDATE`,
      [batchId]
    );
    const b = rows[0];
    if (!b) throw new Error("That batch no longer exists.");
    if (b.disposed_at) throw new Error("A disposed batch cannot be recounted.");
    if (b.expired_at && b.quantity_remaining === 0)
      throw new Error("This batch has expired; its units are no longer usable stock. Dispose of it instead.");
    const delta = newRemaining - b.quantity_remaining;
    if (!delta) return { medicineId: b.medicine_id, delta: 0 };
    await c.query("UPDATE medicine_batches SET quantity_remaining = $1 WHERE batch_id = $2", [newRemaining, batchId]);
    await c.query(
      "UPDATE medicines SET stock_quantity = stock_quantity + $1, updated_at = now() WHERE medicine_id = $2",
      [delta, b.medicine_id]
    );
    await record(c, {
      medicineId: b.medicine_id, batchId, kind: "adjust", quantity: Math.abs(delta), delta, userId,
      note: `Count corrected ${b.quantity_remaining} → ${newRemaining}: ${String(reason).trim()}`,
    });
    return { medicineId: b.medicine_id, delta };
  });
}

// ---- setting a real expiry on a batch that did not have one -------------------
async function setExpiry({ batchId, expiryDate, userId }) {
  return inTx(null, async (c) => {
    const { rows } = await c.query(
      "UPDATE medicine_batches SET expiry_date = $1 WHERE batch_id = $2 AND disposed_at IS NULL RETURNING medicine_id",
      [expiryDate, batchId]
    );
    if (!rows[0]) throw new Error("That batch cannot be changed.");
    await record(c, {
      medicineId: rows[0].medicine_id, batchId, kind: "adjust", quantity: 0, delta: 0, userId,
      note: `Expiry date set to ${expiryDate}`,
    });
    // A date already in the past takes effect now, not tomorrow.
    await expireDue({ client: c });
    return rows[0].medicine_id;
  });
}

// ---- disposal: expired boxes leaving the shelf, or damaged ones ---------------
async function disposeBatch({ batchId, note, userId }) {
  return inTx(null, async (c) => {
    const { rows } = await c.query(
      `SELECT batch_id, medicine_id, quantity_remaining, expired_quantity, disposed_at
         FROM medicine_batches WHERE batch_id = $1 FOR UPDATE`,
      [batchId]
    );
    const b = rows[0];
    if (!b) throw new Error("That batch no longer exists.");
    if (b.disposed_at) throw new Error("That batch was already disposed of.");
    const usable = b.quantity_remaining;       // still counted as stock: leaves stock now
    const expired = b.expired_quantity;        // already out of stock: just leaves the shelf
    if (!usable && !expired) throw new Error("There is nothing left in that batch to dispose of.");
    await c.query(
      `UPDATE medicine_batches
          SET quantity_remaining = 0, disposed_at = now(), disposed_by = $2, disposed_note = $3
        WHERE batch_id = $1`,
      [batchId, userId, note ? String(note).slice(0, 255) : null]
    );
    if (usable) {
      await c.query(
        "UPDATE medicines SET stock_quantity = stock_quantity - $1, updated_at = now() WHERE medicine_id = $2",
        [usable, b.medicine_id]
      );
    }
    await record(c, {
      medicineId: b.medicine_id, batchId, kind: "dispose", quantity: usable + expired, delta: -usable, userId,
      note: [expired ? `${expired} expired` : null, usable ? `${usable} still usable (damaged or recalled)` : null, note]
        .filter(Boolean).join(" · "),
    });
    return { medicineId: b.medicine_id, usable, expired };
  });
}

// ---- archive / restore: an event in the ledger, no stock change ---------------
async function noteArchive({ medicineId, restored, userId }) {
  return inTx(null, async (c) => {
    const { rows } = await c.query("SELECT stock_quantity FROM medicines WHERE medicine_id=$1", [medicineId]);
    await record(c, {
      medicineId, kind: restored ? "restore" : "archive", quantity: rows[0] ? rows[0].stock_quantity : 0, delta: 0, userId,
      note: restored ? "Returned to the inventory list" : "Taken off the inventory list",
    });
  });
}

// ---- checks ----------------------------------------------------------------------
// Medicines whose total disagrees with their batches. Empty is the only
// acceptable answer; the test suite and the migration both assert it.
async function drift(client = null) {
  const { rows } = await (client || db).query(
    `SELECT m.medicine_id, m.name, m.stock_quantity,
            coalesce(sum(b.quantity_remaining), 0)::int AS in_batches
       FROM medicines m LEFT JOIN medicine_batches b ON b.medicine_id = m.medicine_id
      GROUP BY m.medicine_id, m.name, m.stock_quantity
     HAVING m.stock_quantity <> coalesce(sum(b.quantity_remaining), 0)`
  );
  return rows;
}

module.exports = {
  expireDue, restock, allocate, correctBatch, setExpiry, disposeBatch, noteArchive, drift,
  EXPIRING_SOON_DAYS,
};
