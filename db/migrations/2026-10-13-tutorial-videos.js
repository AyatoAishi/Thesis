// ============================================================================
// db/migrations/2026-10-13-tutorial-videos.js
//
// Panel review, Oct 2026: "Add video tutorials sa FAQs for staff and
// patients." The group records the videos and puts them on YouTube or Google
// Drive; the admin pastes each link on the User's manual page. Staff videos
// show in the manual, patient videos in a tab on the patient portal. Kept in
// the database rather than in code so adding one never needs a new release.
//
// Run BEFORE the new code goes live (the manual and portal read this table;
// both still open without it, just with no videos).
// Run: node db/migrations/2026-10-13-tutorial-videos.js   (safe to run twice)
// ============================================================================
require("dotenv").config();
const db = require("../../db");

(async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS tutorial_videos (
      video_id   SERIAL PRIMARY KEY,
      audience   VARCHAR(10) NOT NULL CHECK (audience IN ('staff', 'patient')),
      title      VARCHAR(120) NOT NULL,
      url        VARCHAR(300) NOT NULL,
      created_by INTEGER REFERENCES users(user_id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  console.log("OK: tutorial_videos ready.");
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
