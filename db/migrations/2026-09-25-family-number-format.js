// ============================================================================
// db/migrations/2026-09-25-family-number-format.js
//
// "The people recorded within a Family should have an automatic family number
// (Format: 26-0000)" — the professors' review. The numbers were minted as
// YY-NN (26-00, 26-04); this pads the sequence to four digits, so 26-04
// becomes 26-0004.
//
// It is the SAME number with zeroes in front, never a renumbering: the
// sequence part is read as an integer and written back padded, so 26-04 and
// 26-0004 are provably one household. Anything that does not match YY-N — a
// hand-typed value from before the automatic numbers existed — is left
// exactly as it is, because rewriting a value we cannot interpret would be
// inventing it.
//
// Idempotent: a number already at four digits pads to itself.
//
// Run: node db/migrations/2026-09-25-family-number-format.js
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  const before = await db.query(
    `SELECT family_number, count(*)::int AS n FROM patients
      WHERE family_number IS NOT NULL GROUP BY 1 ORDER BY 1`
  );
  console.log("Before:", before.rows.map((r) => `${r.family_number}(x${r.n})`).join("  ") || "none");

  const { rowCount } = await db.query(
    `UPDATE patients
        SET family_number = split_part(family_number, '-', 1) || '-' ||
                            lpad(split_part(family_number, '-', 2)::int::text, 4, '0')
      WHERE family_number ~ '^[0-9]{2}-[0-9]+$'
        AND length(split_part(family_number, '-', 2)) < 4`
  );
  console.log(`OK: ${rowCount} patient row(s) padded to YY-0000.`);

  const after = await db.query(
    `SELECT family_number, count(*)::int AS n FROM patients
      WHERE family_number IS NOT NULL GROUP BY 1 ORDER BY 1`
  );
  console.log("After: ", after.rows.map((r) => `${r.family_number}(x${r.n})`).join("  ") || "none");

  // Same households, same sizes — the check that nothing was merged or split.
  const sizes = (rows) => rows.map((r) => r.n).sort().join(",");
  console.log(sizes(before.rows) === sizes(after.rows)
    ? "   Household sizes unchanged — no family was merged or split."
    : "   WARNING: household sizes changed. Investigate before continuing.");
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
