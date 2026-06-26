import { getDynamicConfig_CACHED_MAY_BE_STALE } from "../../services/analytics/growthbook.js";
import { getSubscriptionType } from "../auth.js";
import { isEnvTruthy } from "../envUtils.js";
const DEFAULTS = {
  enabled: false,
  pixelValidation: false,
  clipboardPasteMultiline: true,
  mouseAnimation: true,
  hideBeforeAction: true,
  autoTargetDisplay: true,
  clipboardGuard: true,
  coordinateMode: "pixels"
};
function readConfig() {
  return {
    ...DEFAULTS,
    ...getDynamicConfig_CACHED_MAY_BE_STALE(
      "tengu_malort_pedway",
      DEFAULTS
    )
  };
}
function hasRequiredSubscription() {
  if (process.env.USER_TYPE === "ant") return true;
  const tier = getSubscriptionType();
  return tier === "max" || tier === "pro";
}
function getChicagoEnabled() {
  if (process.env.USER_TYPE === "ant" && process.env.MONOREPO_ROOT_DIR && !isEnvTruthy(process.env.ALLOW_ANT_COMPUTER_USE_MCP)) {
    return false;
  }
  return hasRequiredSubscription() && readConfig().enabled;
}
function getChicagoSubGates() {
  const { enabled: _e, coordinateMode: _c, ...subGates } = readConfig();
  return subGates;
}
let frozenCoordinateMode;
function getChicagoCoordinateMode() {
  frozenCoordinateMode ??= readConfig().coordinateMode;
  return frozenCoordinateMode;
}
export {
  getChicagoCoordinateMode,
  getChicagoEnabled,
  getChicagoSubGates
};
