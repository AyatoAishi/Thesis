// One-off migration (2026-09-06): add users.preferences.
//
// Staff can now set the theme, accent colour, font and whether animations run,
// and those choices belong to the account rather than the browser — sign in on
// the desk computer or the tablet and it follows you, which is the point of
// putting it on the user row instead of in localStorage.
//
// One JSONB column rather than four columns, because this is a bag of display
// preferences that will grow. Every addition would otherwise be another
// migration against a live database for something that changes nothing about
// how records are stored or read. Nothing joins on it, nothing filters on it,
// and nothing else in the system depends on its shape — the only reader is
// lib/theme.js, which validates every field on the way in and again on the way
// out, so a row containing nonsense degrades to the defaults rather than
// breaking a page.
//
// NOT NULL DEFAULT '{}' means existing staff need no backfill: an empty object
// is exactly "no preferences set", which resolves to the look the app has
// today.
//
// Safe to re-run.
// Usage: node db/migrations/2026-09-06-user-preferences.js
require("dotenv").config();
const db = require("..");

(async () => {
  await db.query(
    `ALTER TABLE users
       ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb`
  );
  console.log("OK: users.preferences added.");

  const { rows } = await db.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE preferences <> '{}'::jsonb)::int AS customised
       FROM users`
  );
  console.log(
    `Note: ${rows[0].total} staff account(s), ${rows[0].customised} with preferences set. ` +
      `The rest use the defaults, which is the app exactly as it looks now.`
  );

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
