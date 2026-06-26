const POLL_INTERVAL_MS_NOT_AT_CAPACITY = 2e3;
const POLL_INTERVAL_MS_AT_CAPACITY = 6e5;
const MULTISESSION_POLL_INTERVAL_MS_NOT_AT_CAPACITY = POLL_INTERVAL_MS_NOT_AT_CAPACITY;
const MULTISESSION_POLL_INTERVAL_MS_PARTIAL_CAPACITY = POLL_INTERVAL_MS_NOT_AT_CAPACITY;
const MULTISESSION_POLL_INTERVAL_MS_AT_CAPACITY = POLL_INTERVAL_MS_AT_CAPACITY;
const DEFAULT_POLL_CONFIG = {
  poll_interval_ms_not_at_capacity: POLL_INTERVAL_MS_NOT_AT_CAPACITY,
  poll_interval_ms_at_capacity: POLL_INTERVAL_MS_AT_CAPACITY,
  // 0 = disabled. When > 0, at-capacity loops send per-work-item heartbeats
  // at this interval. Independent of poll_interval_ms_at_capacity — both may
  // run (heartbeat periodically yields to poll). 60s gives 5× headroom under
  // the server's 300s heartbeat TTL. Named non_exclusive to distinguish from
  // the old heartbeat_interval_ms field (either-or semantics in pre-#22145
  // clients — heartbeat suppressed poll). Old clients ignore this key; ops
  // can set both fields during rollout.
  non_exclusive_heartbeat_interval_ms: 0,
  multisession_poll_interval_ms_not_at_capacity: MULTISESSION_POLL_INTERVAL_MS_NOT_AT_CAPACITY,
  multisession_poll_interval_ms_partial_capacity: MULTISESSION_POLL_INTERVAL_MS_PARTIAL_CAPACITY,
  multisession_poll_interval_ms_at_capacity: MULTISESSION_POLL_INTERVAL_MS_AT_CAPACITY,
  // Poll query param: reclaim unacknowledged work items older than this.
  // Matches the server's DEFAULT_RECLAIM_OLDER_THAN_MS (work_service.py:24).
  // Enables picking up stale-pending work after JWT expiry, when the prior
  // ack failed because the session_ingress_token was already stale.
  reclaim_older_than_ms: 5e3,
  // 0 = disabled. When > 0, push a silent {type:'keep_alive'} frame to
  // session-ingress at this interval so upstream proxies don't GC an idle
  // remote-control session. 2 min is the default. _v2: bridge-only gate
  // (pre-v2 clients read the old key, new clients ignore it).
  session_keepalive_interval_v2_ms: 12e4
};
export {
  DEFAULT_POLL_CONFIG
};
