import { z } from "zod/v4";
import { getFeatureValue_CACHED_WITH_REFRESH } from "../services/analytics/growthbook.js";
import { lazySchema } from "../utils/lazySchema.js";
import {
  DEFAULT_POLL_CONFIG
} from "./pollConfigDefaults.js";
const zeroOrAtLeast100 = {
  message: "must be 0 (disabled) or \u2265100ms"
};
const pollIntervalConfigSchema = lazySchema(
  () => z.object({
    poll_interval_ms_not_at_capacity: z.number().int().min(100),
    // 0 = no at-capacity polling. Independent of heartbeat — both can be
    // enabled (heartbeat runs, periodically breaks out to poll).
    poll_interval_ms_at_capacity: z.number().int().refine((v) => v === 0 || v >= 100, zeroOrAtLeast100),
    // 0 = disabled; positive value = heartbeat at this interval while at
    // capacity. Runs alongside at-capacity polling, not instead of it.
    // Named non_exclusive to distinguish from the old heartbeat_interval_ms
    // (either-or semantics in pre-#22145 clients). .default(0) so existing
    // GrowthBook configs without this field parse successfully.
    non_exclusive_heartbeat_interval_ms: z.number().int().min(0).default(0),
    // Multisession (bridgeMain.ts) intervals. Defaults match the
    // single-session values so existing configs without these fields
    // preserve current behavior.
    multisession_poll_interval_ms_not_at_capacity: z.number().int().min(100).default(
      DEFAULT_POLL_CONFIG.multisession_poll_interval_ms_not_at_capacity
    ),
    multisession_poll_interval_ms_partial_capacity: z.number().int().min(100).default(
      DEFAULT_POLL_CONFIG.multisession_poll_interval_ms_partial_capacity
    ),
    multisession_poll_interval_ms_at_capacity: z.number().int().refine((v) => v === 0 || v >= 100, zeroOrAtLeast100).default(DEFAULT_POLL_CONFIG.multisession_poll_interval_ms_at_capacity),
    // .min(1) matches the server's ge=1 constraint (work_v1.py:230).
    reclaim_older_than_ms: z.number().int().min(1).default(5e3),
    session_keepalive_interval_v2_ms: z.number().int().min(0).default(12e4)
  }).refine(
    (cfg) => cfg.non_exclusive_heartbeat_interval_ms > 0 || cfg.poll_interval_ms_at_capacity > 0,
    {
      message: "at-capacity liveness requires non_exclusive_heartbeat_interval_ms > 0 or poll_interval_ms_at_capacity > 0"
    }
  ).refine(
    (cfg) => cfg.non_exclusive_heartbeat_interval_ms > 0 || cfg.multisession_poll_interval_ms_at_capacity > 0,
    {
      message: "at-capacity liveness requires non_exclusive_heartbeat_interval_ms > 0 or multisession_poll_interval_ms_at_capacity > 0"
    }
  )
);
function getPollIntervalConfig() {
  const raw = getFeatureValue_CACHED_WITH_REFRESH(
    "tengu_bridge_poll_interval_config",
    DEFAULT_POLL_CONFIG,
    5 * 60 * 1e3
  );
  const parsed = pollIntervalConfigSchema().safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_POLL_CONFIG;
}
export {
  getPollIntervalConfig
};
