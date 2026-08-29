const { query } = require("../config/db");

// Every state-changing action on money, trips, or verification should call
// this. It's what makes "why was this decided" answerable from real data
// instead of institutional memory — used by trip_events too, but this one
// is for cross-cutting admin/account actions (audit_logs table).
async function logAudit({ actorId = null, action, entityType, entityId, before = null, after = null }) {
  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before, after)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [actorId, action, entityType, String(entityId), before, after]
  );
}

// Per-trip event log — lighter weight, used for every status change and
// notable trip moment (e.g. "driver_arrived", "no_show_fee_charged").
async function logTripEvent({ tripId, eventType, actor = "system", metadata = {} }) {
  await query(
    `INSERT INTO trip_events (trip_id, event_type, actor, metadata) VALUES ($1, $2, $3, $4)`,
    [tripId, eventType, actor, metadata]
  );
}

module.exports = { logAudit, logTripEvent };
