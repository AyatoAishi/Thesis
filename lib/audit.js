// ============================================================================
// lib/audit.js — one-line accountability log (v1 update, professor requirement)
// Never blocks the calling route: logging failures are swallowed, not thrown.
// ============================================================================
const db = require("../db");

async function log(userId, action, entityType, entityId, details) {
  try {
    await db.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
       VALUES ($1,$2,$3,$4,$5)`,
      [userId || null, action, entityType || null, entityId || null, details || null]
    );
  } catch (e) {
    console.error("[audit]", e.message);
  }
}

module.exports = { log };
