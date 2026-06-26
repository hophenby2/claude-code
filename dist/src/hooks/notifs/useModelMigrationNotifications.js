import { getGlobalConfig } from "../../utils/config.js";
import { useStartupNotification } from "./useStartupNotification.js";
const MIGRATIONS = [
  // Sonnet 4.5 → 4.6 (pro/max/team premium)
  (c) => {
    if (!recent(c.sonnet45To46MigrationTimestamp)) return;
    return {
      key: "sonnet-46-update",
      text: "Model updated to Sonnet 4.6",
      color: "suggestion",
      priority: "high",
      timeoutMs: 3e3
    };
  },
  // Opus Pro → default, or pinned 4.0/4.1 → opus alias. Both land on the
  // current Opus default (4.6 for 1P).
  (c) => {
    const isLegacyRemap = Boolean(c.legacyOpusMigrationTimestamp);
    const ts = c.legacyOpusMigrationTimestamp ?? c.opusProMigrationTimestamp;
    if (!recent(ts)) return;
    return {
      key: "opus-pro-update",
      text: isLegacyRemap ? "Model updated to Opus 4.6 \xB7 Set CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP=1 to opt out" : "Model updated to Opus 4.6",
      color: "suggestion",
      priority: "high",
      timeoutMs: isLegacyRemap ? 8e3 : 3e3
    };
  }
];
function useModelMigrationNotifications() {
  useStartupNotification(_temp);
}
function _temp() {
  const config = getGlobalConfig();
  const notifs = [];
  for (const migration of MIGRATIONS) {
    const notif = migration(config);
    if (notif) {
      notifs.push(notif);
    }
  }
  return notifs.length > 0 ? notifs : null;
}
function recent(ts) {
  return ts !== void 0 && Date.now() - ts < 3e3;
}
export {
  useModelMigrationNotifications
};
