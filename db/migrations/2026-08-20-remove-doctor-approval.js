// One-off migration (2026-08-20): retire the doctor-approval step.
//
// There is no doctor at this clinic. The staff confirmed it. Every request for
// a controlled medicine went into a queue waiting for a sign-off from someone
// who was never going to arrive — one had been sitting there since 2026-07-26,
// the day the system launched, for a patient who presumably went home without
// their Amoxicillin or was handed it off the books.
//
// What this does, and does not, touch:
//
//   medicines.requires_doctor_approval  -> cleared. The flag no longer means
//     anything, and leaving it set would quietly resurrect the old behaviour
//     if the column were ever read again.
//
//   medicine_dispenses (old rows)       -> LEFT ALONE. Those columns record how
//     each dispense was actually handled at the time. Rewriting them to match
//     today's workflow would be falsifying a medical record.
//
//   the one dispense still pending      -> deleted, and written to the audit
//     log. It never subtracted stock, so nothing physical ever happened; what
//     it would do if left behind is show a medicine in a patient's history
//     that they never received. Deleting is the only option that leaves both
//     the shelf count and the patient's record honest.
//
// The columns themselves stay in the schema. Dropping them would destroy the
// history above for no gain.
//
// Safe to re-run (the second run finds nothing to do).
// Usage: node db/migrations/2026-08-20-remove-doctor-approval.js
require("dotenv").config();
const db = require("..");

(async () => {
  const flagged = await db.query(
    `UPDATE medicines SET requires_doctor_approval = false, updated_at = now()
      WHERE requires_doctor_approval = true
      RETURNING name`
  );
  console.log(
    flagged.rowCount
      ? `OK: cleared the approval flag on ${flagged.rowCount} medicine(s): ${flagged.rows.map((r) => r.name).join(", ")}.`
      : "OK: no medicines were flagged."
  );

  const pending = await db.query(
    `SELECT d.dispense_id, d.quantity, m.name AS medicine, p.full_name AS patient,
            d.dispensed_at, u.full_name AS dispensed_by
       FROM medicine_dispenses d
       JOIN medicines m ON m.medicine_id = d.medicine_id
       JOIN patients  p ON p.patient_id  = d.patient_id
       LEFT JOIN users u ON u.user_id = d.dispensed_by
      WHERE d.requires_doctor_approval = true AND d.approved_at IS NULL`
  );

  for (const d of pending.rows) {
    const when = new Date(d.dispensed_at).toISOString().slice(0, 10);
    const detail =
      `${d.quantity} x ${d.medicine} for ${d.patient}, recorded ${when} by ` +
      `${d.dispensed_by || "unknown"} — never approved, stock never deducted; ` +
      `removed when the doctor-approval step was retired`;
    await db.query("DELETE FROM medicine_dispenses WHERE dispense_id = $1", [d.dispense_id]);
    await db.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
       VALUES (NULL, 'delete', 'dispense', $1, $2)`,
      [d.dispense_id, detail.slice(0, 255)]
    );
    console.log(`OK: removed pending dispense #${d.dispense_id} — ${detail}`);
  }
  if (!pending.rowCount) console.log("OK: no pending dispenses to clear.");

  const left = await db.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE requires_doctor_approval)::int AS historical_flagged
       FROM medicine_dispenses`
  );
  console.log(
    `Note: ${left.rows[0].total} dispense(s) remain; ${left.rows[0].historical_flagged} keep their ` +
      `historical approval record and are left as they were.`
  );

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
