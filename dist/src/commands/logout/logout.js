import { jsx } from "react/jsx-runtime";
import { clearTrustedDeviceTokenCache } from "../../bridge/trustedDevice.js";
import { Text } from "../../ink.js";
import { refreshGrowthBookAfterAuthChange } from "../../services/analytics/growthbook.js";
import { getGroveNoticeConfig, getGroveSettings } from "../../services/api/grove.js";
import { clearPolicyLimitsCache } from "../../services/policyLimits/index.js";
import { clearRemoteManagedSettingsCache } from "../../services/remoteManagedSettings/index.js";
import { getClaudeAIOAuthTokens, removeApiKey } from "../../utils/auth.js";
import { clearBetasCaches } from "../../utils/betas.js";
import { saveGlobalConfig } from "../../utils/config.js";
import { gracefulShutdownSync } from "../../utils/gracefulShutdown.js";
import { getSecureStorage } from "../../utils/secureStorage/index.js";
import { clearToolSchemaCache } from "../../utils/toolSchemaCache.js";
import { resetUserCache } from "../../utils/user.js";
async function performLogout({
  clearOnboarding = false
}) {
  const {
    flushTelemetry
  } = await import("../../utils/telemetry/instrumentation.js");
  await flushTelemetry();
  await removeApiKey();
  const secureStorage = getSecureStorage();
  secureStorage.delete();
  await clearAuthRelatedCaches();
  saveGlobalConfig((current) => {
    const updated = {
      ...current
    };
    if (clearOnboarding) {
      updated.hasCompletedOnboarding = false;
      updated.subscriptionNoticeCount = 0;
      updated.hasAvailableSubscription = false;
      if (updated.customApiKeyResponses?.approved) {
        updated.customApiKeyResponses = {
          ...updated.customApiKeyResponses,
          approved: []
        };
      }
    }
    updated.oauthAccount = void 0;
    return updated;
  });
}
async function clearAuthRelatedCaches() {
  getClaudeAIOAuthTokens.cache?.clear?.();
  clearTrustedDeviceTokenCache();
  clearBetasCaches();
  clearToolSchemaCache();
  resetUserCache();
  refreshGrowthBookAfterAuthChange();
  getGroveNoticeConfig.cache?.clear?.();
  getGroveSettings.cache?.clear?.();
  await clearRemoteManagedSettingsCache();
  await clearPolicyLimitsCache();
}
async function call() {
  await performLogout({
    clearOnboarding: true
  });
  const message = /* @__PURE__ */ jsx(Text, { children: "Successfully logged out from your Anthropic account." });
  setTimeout(() => {
    gracefulShutdownSync(0, "logout");
  }, 200);
  return message;
}
export {
  call,
  clearAuthRelatedCaches,
  performLogout
};
