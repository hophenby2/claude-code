import { z } from "zod/v4";
import { getFeatureValue_DEPRECATED } from "../services/analytics/growthbook.js";
import { lazySchema } from "../utils/lazySchema.js";
import { lt } from "../utils/semver.js";
import { isEnvLessBridgeEnabled } from "./bridgeEnabled.js";
const DEFAULT_ENV_LESS_BRIDGE_CONFIG = {
  init_retry_max_attempts: 3,
  init_retry_base_delay_ms: 500,
  init_retry_jitter_fraction: 0.25,
  init_retry_max_delay_ms: 4e3,
  http_timeout_ms: 1e4,
  uuid_dedup_buffer_size: 2e3,
  heartbeat_interval_ms: 2e4,
  heartbeat_jitter_fraction: 0.1,
  token_refresh_buffer_ms: 3e5,
  teardown_archive_timeout_ms: 1500,
  connect_timeout_ms: 15e3,
  min_version: "0.0.0",
  should_show_app_upgrade_message: false
};
const envLessBridgeConfigSchema = lazySchema(
  () => z.object({
    init_retry_max_attempts: z.number().int().min(1).max(10).default(3),
    init_retry_base_delay_ms: z.number().int().min(100).default(500),
    init_retry_jitter_fraction: z.number().min(0).max(1).default(0.25),
    init_retry_max_delay_ms: z.number().int().min(500).default(4e3),
    http_timeout_ms: z.number().int().min(2e3).default(1e4),
    uuid_dedup_buffer_size: z.number().int().min(100).max(5e4).default(2e3),
    // Server TTL is 60s. Floor 5s prevents thrash; cap 30s keeps ≥2× margin.
    heartbeat_interval_ms: z.number().int().min(5e3).max(3e4).default(2e4),
    // ±fraction per beat. Cap 0.5: at max interval (30s) × 1.5 = 45s worst case,
    // still under the 60s TTL.
    heartbeat_jitter_fraction: z.number().min(0).max(0.5).default(0.1),
    // Floor 30s prevents tight-looping. Cap 30min rejects buffer-vs-delay
    // semantic inversion: ops entering expires_in-5min (the *delay until
    // refresh*) instead of 5min (the *buffer before expiry*) yields
    // delayMs = expires_in - buffer ≈ 5min instead of ≈4h. Both are positive
    // durations so .min() alone can't distinguish; .max() catches the
    // inverted value since buffer ≥ 30min is nonsensical for a multi-hour JWT.
    token_refresh_buffer_ms: z.number().int().min(3e4).max(18e5).default(3e5),
    // Cap 2000 keeps this under gracefulShutdown's 2s cleanup race — a higher
    // timeout just lies to axios since forceExit kills the socket regardless.
    teardown_archive_timeout_ms: z.number().int().min(500).max(2e3).default(1500),
    // Observed p99 connect is ~2-3s; 15s is ~5× headroom. Floor 5s bounds
    // false-positive rate under transient slowness; cap 60s bounds how long
    // a truly-stalled session stays dark.
    connect_timeout_ms: z.number().int().min(5e3).max(6e4).default(15e3),
    min_version: z.string().refine((v) => {
      try {
        lt(v, "0.0.0");
        return true;
      } catch {
        return false;
      }
    }).default("0.0.0"),
    should_show_app_upgrade_message: z.boolean().default(false)
  })
);
async function getEnvLessBridgeConfig() {
  const raw = await getFeatureValue_DEPRECATED(
    "tengu_bridge_repl_v2_config",
    DEFAULT_ENV_LESS_BRIDGE_CONFIG
  );
  const parsed = envLessBridgeConfigSchema().safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_ENV_LESS_BRIDGE_CONFIG;
}
async function checkEnvLessBridgeMinVersion() {
  const cfg = await getEnvLessBridgeConfig();
  if (cfg.min_version && lt("0.0.0-dev", cfg.min_version)) {
    return `Your version of Claude Code (${"0.0.0-dev"}) is too old for Remote Control.
Version ${cfg.min_version} or higher is required. Run \`claude update\` to update.`;
  }
  return null;
}
async function shouldShowAppUpgradeMessage() {
  if (!isEnvLessBridgeEnabled()) return false;
  const cfg = await getEnvLessBridgeConfig();
  return cfg.should_show_app_upgrade_message;
}
export {
  DEFAULT_ENV_LESS_BRIDGE_CONFIG,
  checkEnvLessBridgeMinVersion,
  getEnvLessBridgeConfig,
  shouldShowAppUpgradeMessage
};
