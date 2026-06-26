import { jsx } from "react/jsx-runtime";
import { useEffect, useMemo } from "react";
import { Box, Text } from "../../ink.js";
import { getDynamicConfig_CACHED_MAY_BE_STALE } from "../../services/analytics/growthbook.js";
import { getGlobalConfig, saveGlobalConfig } from "../../utils/config.js";
const CONFIG_NAME = "tengu-top-of-feed-tip";
function EmergencyTip() {
  const tip = useMemo(getTipOfFeed, []);
  const lastShownTip = useMemo(() => getGlobalConfig().lastShownEmergencyTip, []);
  const shouldShow = tip.tip && tip.tip !== lastShownTip;
  useEffect(() => {
    if (shouldShow) {
      saveGlobalConfig((current) => {
        if (current.lastShownEmergencyTip === tip.tip) return current;
        return {
          ...current,
          lastShownEmergencyTip: tip.tip
        };
      });
    }
  }, [shouldShow, tip.tip]);
  if (!shouldShow) {
    return null;
  }
  return /* @__PURE__ */ jsx(Box, { paddingLeft: 2, flexDirection: "column", children: /* @__PURE__ */ jsx(Text, { ...tip.color === "warning" ? {
    color: "warning"
  } : tip.color === "error" ? {
    color: "error"
  } : {
    dimColor: true
  }, children: tip.tip }) });
}
const DEFAULT_TIP = {
  tip: "",
  color: "dim"
};
function getTipOfFeed() {
  return getDynamicConfig_CACHED_MAY_BE_STALE(CONFIG_NAME, DEFAULT_TIP);
}
export {
  EmergencyTip
};
