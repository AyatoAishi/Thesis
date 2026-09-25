// ============================================================================
// db/migrations/2026-09-25-medicine-batches.js
//
// Expiry dates, per delivery, and a ledger of every stock movement.
//
// From the professors' review:
//   "When will the expired medicines be removed?"
//   "Expired medicines should belong to reports too, and it should update when
//    the medicines get restocked, when a medicine gets archived, when a
//    medicine gets dispensed, and when a medicine is already expired. It
//    should be trackable, and exportable."
//
// WHY PER BATCH. A single expiry date on the medicine cannot answer "how many
// boxes have expired", because stock arrives at different times with different
// dates. Restocking would overwrite the date on everything, and the old boxes
// nearing expiry would vanish from view — which is precisely what the review is
// worried about. So each delivery is a batch with its own expiry.
//
// THE INVARIANT. medicines.stock_quantity stays, because every list, dropdown,
// alert and report in the system already reads it. It now means USABLE stock,
// and it is always equal to the sum of quantity_remaining over the medicine's
// batches. Nothing writes it except lib/stock.js, inside the same transaction
// as the batch change, and test/stock.test.js checks the equality.
//
// EXISTING STOCK. Every medicine with stock on hand gets one "opening balance"
// batch holding exactly that quantity, with the expiry left blank — it was
// never recorded, and inventing a date would be worse than admitting it. Staff
// can set the real date on that batch from the medicine's page.
//
// Idempotent: re-running creates nothing twice.
//
// Run: node db/migrations/2026-09-25-medicine-batches.js
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  const client = await db.getClient();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS medicine_batches (
        batch_id           SERIAL PRIMARY KEY,
        medicine_id        INTEGER NOT NULL REFERENCES medicines(medicine_id),
        quantity_received  INTEGER NOT NULL CHECK (quantity_received >= 0),
        quantity_remaining INTEGER NOT NULL CHECK (quantity_remaining >= 0),
        expired_quantity   INTEGER NOT NULL DEFAULT 0 CHECK (expired_quantity >= 0),
        expiry_date        DATE,
        received_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        source             VARCHAR(150),
        note               VARCHAR(255),
        received_by        INTEGER REFERENCES users(user_id),
        expired_at         TIMESTAMPTZ,
        disposed_at        TIMESTAMPTZ,
        disposed_by        INTEGER REFERENCES users(user_id),
        disposed_note      VARCHAR(255)
      )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_batches_medicine ON medicine_batches (medicine_id)`);
    // The FEFO pick: usable batches of one medicine, soonest expiry first.
    await client.query(`CREATE INDEX IF NOT EXISTS idx_batches_usable
      ON medicine_batches (medicine_id, expiry_date NULLS LAST, received_at)
      WHERE quantity_remaining > 0`);
    console.log("OK: medicine_batches ready.");

    // quantity   = units the movement is about (always >= 0)
    // stock_delta= what it did to usable stock (signed)
    // stock_after= usable stock of the medicine right after it
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        movement_id  SERIAL PRIMARY KEY,
        medicine_id  INTEGER NOT NULL REFERENCES medicines(medicine_id),
        batch_id     INTEGER REFERENCES medicine_batches(batch_id),
        dispense_id  INTEGER REFERENCES medicine_dispenses(dispense_id) ON DELETE SET NULL,
        kind         VARCHAR(12) NOT NULL
                     CHECK (kind IN ('opening','restock','dispense','expire','dispose','adjust','archive','restore')),
        quantity     INTEGER NOT NULL CHECK (quantity >= 0),
        stock_delta  INTEGER NOT NULL,
        stock_after  INTEGER NOT NULL,
        note         VARCHAR(255),
        by_user      INTEGER REFERENCES users(user_id),
        at           TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_movements_at ON stock_movements (at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_movements_medicine ON stock_movements (medicine_id, at DESC)`);
    console.log("OK: stock_movements ready.");

    // "Sa baba ng medicine … mag add tayo ng space don para matype ng
    // staff/nurse kung gano kadalas ittake ung meds pero make it optional."
    await client.query(`ALTER TABLE medicine_dispenses ADD COLUMN IF NOT EXISTS instructions VARCHAR(160)`);
    console.log("OK: medicine_dispenses.instructions added.");

    // Opening balances — only for medicines that have stock and no batch yet.
    const { rows: open } = await client.query(`
      SELECT m.medicine_id, m.stock_quantity, m.source
        FROM medicines m
       WHERE m.stock_quantity > 0
         AND NOT EXISTS (SELECT 1 FROM medicine_batches b WHERE b.medicine_id = m.medicine_id)`);
    for (const m of open) {
      const { rows } = await client.query(
        `INSERT INTO medicine_batches (medicine_id, quantity_received, quantity_remaining, source, note)
         VALUES ($1, $2, $2, $3, 'Opening balance: stock on hand when batch tracking began. Expiry was not recorded.')
         RETURNING batch_id`,
        [m.medicine_id, m.stock_quantity, m.source]
      );
      await client.query(
        `INSERT INTO stock_movements (medicine_id, batch_id, kind, quantity, stock_delta, stock_after, note)
         VALUES ($1, $2, 'opening', $3, 0, $3, 'Opening balance carried over')`,
        [m.medicine_id, rows[0].batch_id, m.stock_quantity]
      );
    }
    console.log(`OK: ${open.length} opening-balance batch(es) created.`);

    // The invariant, checked before anything is committed.
    const { rows: drift } = await client.query(`
      SELECT m.medicine_id, m.name, m.stock_quantity,
             coalesce(sum(b.quantity_remaining), 0)::int AS in_batches
        FROM medicines m LEFT JOIN medicine_batches b ON b.medicine_id = m.medicine_id
       GROUP BY m.medicine_id, m.name, m.stock_quantity
      HAVING m.stock_quantity <> coalesce(sum(b.quantity_remaining), 0)`);
    if (drift.length) {
      console.error("Stock does not equal the batches for:", drift);
      throw new Error("invariant broken — rolled back");
    }
    console.log("   Invariant holds: every medicine's stock equals the sum of its batches.");

    await client.query("COMMIT");
    process.exit(0);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("FAILED:", e.message);
    process.exit(1);
  } finally {
    client.release();
  }
})();
