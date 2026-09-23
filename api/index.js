// ============================================================================
// api/index.js — the serverless entry point.
//
// Vercel does not run a server. It runs a function, once per request, and
// freezes it again afterwards. This file is the handle it holds: server.js
// exports the Express app, and an Express app IS a request handler, so it can
// be passed straight through with nothing in between.
//
// Everything that made the app work on a real server still works here, with
// two exceptions that are handled where they live rather than here:
//
//   - The in-process node-cron is skipped when process.env.VERCEL is set. A
//     timer on a function that is about to be frozen never fires. The real
//     trigger has always been cron-job.org calling /tasks/run-reminders.
//
//   - DATABASE_URL must be Neon's POOLED connection string (the host with
//     "-pooler" in it). Each cold function builds its own pool, so dozens of
//     small pools appear under load; the pooler is what stops that from
//     exhausting the database's connection limit. This is the one setting that
//     will look fine in testing and fall over in front of people.
// ============================================================================
module.exports = require("../server.js");
