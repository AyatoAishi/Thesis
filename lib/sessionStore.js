// ============================================================================
// lib/sessionStore.js — sign-ins kept in Postgres, with a fallback for the day
// Postgres is unreachable (panel review, Oct 2026).
//
// Sessions normally live in the main database (connect-pg-simple), which
// survives Render putting the app to sleep. But if that database is down, no
// one could stay signed in at all — including the recovery super admin, whose
// whole job is to fix exactly that. So when the database fails, sessions are
// kept in this server's memory instead, and for the next 30 seconds the
// database is not even tried, so each page does not wait on a dead connection.
//
// Memory sessions vanish when the app restarts. That is acceptable for the
// rare emergency they exist for; in normal operation every session is in
// Postgres exactly as before.
// ============================================================================
const session = require("express-session");

const RETRY_MS = 30 * 1000;

class FallbackStore extends session.Store {
  constructor(primary) {
    super();
    this.primary = primary;
    this.memory = new session.MemoryStore();
    this.downUntil = 0;
  }

  primaryUp() { return Date.now() >= this.downUntil; }

  markDown(err) {
    if (this.primaryUp()) console.error("[session] database unreachable, using memory:", err && err.message);
    this.downUntil = Date.now() + RETRY_MS;
  }

  get(sid, cb) {
    if (!this.primaryUp()) return this.memory.get(sid, cb);
    this.primary.get(sid, (err, sess) => {
      if (err) this.markDown(err);
      if (!err && sess) return cb(null, sess);
      // Not in the database (or it failed): it may be one kept in memory.
      this.memory.get(sid, (e2, s2) => cb(null, s2 || null));
    });
  }

  set(sid, sess, cb) {
    const done = cb || (() => {});
    if (!this.primaryUp()) return this.memory.set(sid, sess, done);
    this.primary.set(sid, sess, (err) => {
      if (!err) return this.memory.destroy(sid, () => done(null));
      this.markDown(err);
      this.memory.set(sid, sess, done);
    });
  }

  destroy(sid, cb) {
    const done = cb || (() => {});
    this.memory.destroy(sid, () => {
      if (!this.primaryUp()) return done(null);
      this.primary.destroy(sid, (err) => {
        if (err) this.markDown(err);
        done(null);
      });
    });
  }

  touch(sid, sess, cb) {
    const done = cb || (() => {});
    if (!this.primaryUp() || typeof this.primary.touch !== "function") return this.memory.touch(sid, sess, done);
    this.primary.touch(sid, sess, (err) => {
      if (err) { this.markDown(err); return this.memory.touch(sid, sess, done); }
      done(null);
    });
  }
}

module.exports = { FallbackStore };
