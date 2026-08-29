// The single source of truth for which trip status can move to which other
// status. Nothing in this codebase should ever write trips.status directly
// without going through canTransition()/assertTransition() below — that's
// what makes "never allow invalid state transitions" (from the brief) an
// actual guarantee instead of a hope.

const TRANSITIONS = {
  requested: ["searching_for_driver", "cancelled_by_rider", "no_driver_found"],
  searching_for_driver: ["driver_assigned", "no_driver_found", "cancelled_by_rider"],
  driver_assigned: ["driver_accepted", "cancelled_by_rider", "cancelled_by_driver"],
  driver_accepted: ["driver_en_route_to_pickup", "cancelled_by_rider", "cancelled_by_driver", "cancelled_for_safety"],
  driver_en_route_to_pickup: ["driver_arrived", "cancelled_by_rider", "cancelled_by_driver", "cancelled_for_safety"],
  driver_arrived: ["rider_onboard", "cancelled_by_rider", "cancelled_by_driver", "cancelled_for_safety"],
  rider_onboard: ["trip_started", "cancelled_for_safety"],
  trip_started: ["trip_completed", "cancelled_for_safety", "disputed"],
  trip_completed: ["payment_completed", "payment_failed", "disputed"],
  payment_completed: ["rated"],
  payment_failed: ["payment_completed", "disputed"],
  rated: [],
  cancelled_by_rider: [],
  cancelled_by_driver: [],
  cancelled_for_safety: [],
  no_driver_found: [],
  disputed: ["trip_completed", "cancelled_for_safety"], // resolved manually by support/admin
};

function canTransition(fromStatus, toStatus) {
  const allowed = TRANSITIONS[fromStatus];
  if (!allowed) throw new Error(`Unknown trip status "${fromStatus}"`);
  return allowed.includes(toStatus);
}

function assertTransition(fromStatus, toStatus) {
  if (!canTransition(fromStatus, toStatus)) {
    const err = new Error(`Invalid trip transition: ${fromStatus} → ${toStatus}`);
    err.statusCode = 400;
    err.code = "INVALID_TRIP_TRANSITION";
    throw err;
  }
}

module.exports = { TRANSITIONS, canTransition, assertTransition };
