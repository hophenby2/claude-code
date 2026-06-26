import axios from "axios";
import memoize from "lodash-es/memoize.js";
import {
  logEvent
} from "../analytics/index.js";
import { getOauthAccountInfo, isConsumerSubscriber } from "../../utils/auth.js";
import { logForDebugging } from "../../utils/debug.js";
import { gracefulShutdown } from "../../utils/gracefulShutdown.js";
import { isEssentialTrafficOnly } from "../../utils/privacyLevel.js";
import { writeToStderr } from "../../utils/process.js";
import { getOauthConfig } from "../../constants/oauth.js";
import { getGlobalConfig, saveGlobalConfig } from "../../utils/config.js";
import {
  getAuthHeaders,
  getUserAgent,
  withOAuth401Retry
} from "../../utils/http.js";
import { logError } from "../../utils/log.js";
import { getClaudeCodeUserAgent } from "../../utils/userAgent.js";
const GROVE_CACHE_EXPIRATION_MS = 24 * 60 * 60 * 1e3;
const getGroveSettings = memoize(
  async () => {
    if (isEssentialTrafficOnly()) {
      return { success: false };
    }
    try {
      const response = await withOAuth401Retry(() => {
        const authHeaders = getAuthHeaders();
        if (authHeaders.error) {
          throw new Error(`Failed to get auth headers: ${authHeaders.error}`);
        }
        return axios.get(
          `${getOauthConfig().BASE_API_URL}/api/oauth/account/settings`,
          {
            headers: {
              ...authHeaders.headers,
              "User-Agent": getClaudeCodeUserAgent()
            }
          }
        );
      });
      return { success: true, data: response.data };
    } catch (err) {
      logError(err);
      getGroveSettings.cache.clear?.();
      return { success: false };
    }
  }
);
async function markGroveNoticeViewed() {
  try {
    await withOAuth401Retry(() => {
      const authHeaders = getAuthHeaders();
      if (authHeaders.error) {
        throw new Error(`Failed to get auth headers: ${authHeaders.error}`);
      }
      return axios.post(
        `${getOauthConfig().BASE_API_URL}/api/oauth/account/grove_notice_viewed`,
        {},
        {
          headers: {
            ...authHeaders.headers,
            "User-Agent": getClaudeCodeUserAgent()
          }
        }
      );
    });
    getGroveSettings.cache.clear?.();
  } catch (err) {
    logError(err);
  }
}
async function updateGroveSettings(groveEnabled) {
  try {
    await withOAuth401Retry(() => {
      const authHeaders = getAuthHeaders();
      if (authHeaders.error) {
        throw new Error(`Failed to get auth headers: ${authHeaders.error}`);
      }
      return axios.patch(
        `${getOauthConfig().BASE_API_URL}/api/oauth/account/settings`,
        {
          grove_enabled: groveEnabled
        },
        {
          headers: {
            ...authHeaders.headers,
            "User-Agent": getClaudeCodeUserAgent()
          }
        }
      );
    });
    getGroveSettings.cache.clear?.();
  } catch (err) {
    logError(err);
  }
}
async function isQualifiedForGrove() {
  if (!isConsumerSubscriber()) {
    return false;
  }
  const accountId = getOauthAccountInfo()?.accountUuid;
  if (!accountId) {
    return false;
  }
  const globalConfig = getGlobalConfig();
  const cachedEntry = globalConfig.groveConfigCache?.[accountId];
  const now = Date.now();
  if (!cachedEntry) {
    logForDebugging(
      "Grove: No cache, fetching config in background (dialog skipped this session)"
    );
    void fetchAndStoreGroveConfig(accountId);
    return false;
  }
  if (now - cachedEntry.timestamp > GROVE_CACHE_EXPIRATION_MS) {
    logForDebugging(
      "Grove: Cache stale, returning cached data and refreshing in background"
    );
    void fetchAndStoreGroveConfig(accountId);
    return cachedEntry.grove_enabled;
  }
  logForDebugging("Grove: Using fresh cached config");
  return cachedEntry.grove_enabled;
}
async function fetchAndStoreGroveConfig(accountId) {
  try {
    const result = await getGroveNoticeConfig();
    if (!result.success) {
      return;
    }
    const groveEnabled = result.data.grove_enabled;
    const cachedEntry = getGlobalConfig().groveConfigCache?.[accountId];
    if (cachedEntry?.grove_enabled === groveEnabled && Date.now() - cachedEntry.timestamp <= GROVE_CACHE_EXPIRATION_MS) {
      return;
    }
    saveGlobalConfig((current) => ({
      ...current,
      groveConfigCache: {
        ...current.groveConfigCache,
        [accountId]: {
          grove_enabled: groveEnabled,
          timestamp: Date.now()
        }
      }
    }));
  } catch (err) {
    logForDebugging(`Grove: Failed to fetch and store config: ${err}`);
  }
}
const getGroveNoticeConfig = memoize(
  async () => {
    if (isEssentialTrafficOnly()) {
      return { success: false };
    }
    try {
      const response = await withOAuth401Retry(() => {
        const authHeaders = getAuthHeaders();
        if (authHeaders.error) {
          throw new Error(`Failed to get auth headers: ${authHeaders.error}`);
        }
        return axios.get(
          `${getOauthConfig().BASE_API_URL}/api/claude_code_grove`,
          {
            headers: {
              ...authHeaders.headers,
              "User-Agent": getUserAgent()
            },
            timeout: 3e3
            // Short timeout - if slow, skip Grove dialog
          }
        );
      });
      const {
        grove_enabled,
        domain_excluded,
        notice_is_grace_period,
        notice_reminder_frequency
      } = response.data;
      return {
        success: true,
        data: {
          grove_enabled,
          domain_excluded: domain_excluded ?? false,
          notice_is_grace_period: notice_is_grace_period ?? true,
          notice_reminder_frequency
        }
      };
    } catch (err) {
      logForDebugging(`Failed to fetch Grove notice config: ${err}`);
      return { success: false };
    }
  }
);
function calculateShouldShowGrove(settingsResult, configResult, showIfAlreadyViewed) {
  if (!settingsResult.success || !configResult.success) {
    return false;
  }
  const settings = settingsResult.data;
  const config = configResult.data;
  const hasChosen = settings.grove_enabled !== null;
  if (hasChosen) {
    return false;
  }
  if (showIfAlreadyViewed) {
    return true;
  }
  if (!config.notice_is_grace_period) {
    return true;
  }
  const reminderFrequency = config.notice_reminder_frequency;
  if (reminderFrequency !== null && settings.grove_notice_viewed_at) {
    const daysSinceViewed = Math.floor(
      (Date.now() - new Date(settings.grove_notice_viewed_at).getTime()) / (1e3 * 60 * 60 * 24)
    );
    return daysSinceViewed >= reminderFrequency;
  } else {
    const viewedAt = settings.grove_notice_viewed_at;
    return viewedAt === null || viewedAt === void 0;
  }
}
async function checkGroveForNonInteractive() {
  const [settingsResult, configResult] = await Promise.all([
    getGroveSettings(),
    getGroveNoticeConfig()
  ]);
  const shouldShowGrove = calculateShouldShowGrove(
    settingsResult,
    configResult,
    false
  );
  if (shouldShowGrove) {
    const config = configResult.success ? configResult.data : null;
    logEvent("tengu_grove_print_viewed", {
      dismissable: config?.notice_is_grace_period
    });
    if (config === null || config.notice_is_grace_period) {
      writeToStderr(
        "\nAn update to our Consumer Terms and Privacy Policy will take effect on October 8, 2025. Run `claude` to review the updated terms.\n\n"
      );
      await markGroveNoticeViewed();
    } else {
      writeToStderr(
        "\n[ACTION REQUIRED] An update to our Consumer Terms and Privacy Policy has taken effect on October 8, 2025. You must run `claude` to review the updated terms.\n\n"
      );
      await gracefulShutdown(1);
    }
  }
}
export {
  calculateShouldShowGrove,
  checkGroveForNonInteractive,
  getGroveNoticeConfig,
  getGroveSettings,
  isQualifiedForGrove,
  markGroveNoticeViewed,
  updateGroveSettings
};
