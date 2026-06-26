import { getDirectConnectServerUrl, getSessionId } from "../bootstrap/state.js";
import { stringWidth } from "../ink/stringWidth.js";
import { getSubscriptionName, isClaudeAISubscriber } from "./auth.js";
import { getCwd } from "./cwd.js";
import { getDisplayPath } from "./file.js";
import {
  truncate,
  truncateToWidth,
  truncateToWidthNoEllipsis
} from "./format.js";
import { getStoredChangelogFromMemory, parseChangelog } from "./releaseNotes.js";
import { gt } from "./semver.js";
import { loadMessageLogs } from "./sessionStorage.js";
import { getInitialSettings } from "./settings/settings.js";
const MAX_LEFT_WIDTH = 50;
const MAX_USERNAME_LENGTH = 20;
const BORDER_PADDING = 4;
const DIVIDER_WIDTH = 1;
const CONTENT_PADDING = 2;
function getLayoutMode(columns) {
  if (columns >= 70) return "horizontal";
  return "compact";
}
function calculateLayoutDimensions(columns, layoutMode, optimalLeftWidth) {
  if (layoutMode === "horizontal") {
    const leftWidth = optimalLeftWidth;
    const usedSpace = BORDER_PADDING + CONTENT_PADDING + DIVIDER_WIDTH + leftWidth;
    const availableForRight = columns - usedSpace;
    let rightWidth = Math.max(30, availableForRight);
    const totalWidth2 = Math.min(
      leftWidth + rightWidth + DIVIDER_WIDTH + CONTENT_PADDING,
      columns - BORDER_PADDING
    );
    if (totalWidth2 < leftWidth + rightWidth + DIVIDER_WIDTH + CONTENT_PADDING) {
      rightWidth = totalWidth2 - leftWidth - DIVIDER_WIDTH - CONTENT_PADDING;
    }
    return { leftWidth, rightWidth, totalWidth: totalWidth2 };
  }
  const totalWidth = Math.min(columns - BORDER_PADDING, MAX_LEFT_WIDTH + 20);
  return {
    leftWidth: totalWidth,
    rightWidth: totalWidth,
    totalWidth
  };
}
function calculateOptimalLeftWidth(welcomeMessage, truncatedCwd, modelLine) {
  const contentWidth = Math.max(
    stringWidth(welcomeMessage),
    stringWidth(truncatedCwd),
    stringWidth(modelLine),
    20
    // Minimum for clawd art
  );
  return Math.min(contentWidth + 4, MAX_LEFT_WIDTH);
}
function formatWelcomeMessage(username) {
  if (!username || username.length > MAX_USERNAME_LENGTH) {
    return "Welcome back!";
  }
  return `Welcome back ${username}!`;
}
function truncatePath(path, maxLength) {
  if (stringWidth(path) <= maxLength) return path;
  const separator = "/";
  const ellipsis = "\u2026";
  const ellipsisWidth = 1;
  const separatorWidth = 1;
  const parts = path.split(separator);
  const first = parts[0] || "";
  const last = parts[parts.length - 1] || "";
  const firstWidth = stringWidth(first);
  const lastWidth = stringWidth(last);
  if (parts.length === 1) {
    return truncateToWidth(path, maxLength);
  }
  if (first === "" && ellipsisWidth + separatorWidth + lastWidth >= maxLength) {
    return `${separator}${truncateToWidth(last, Math.max(1, maxLength - separatorWidth))}`;
  }
  if (first !== "" && ellipsisWidth * 2 + separatorWidth + lastWidth >= maxLength) {
    return `${ellipsis}${separator}${truncateToWidth(last, Math.max(1, maxLength - ellipsisWidth - separatorWidth))}`;
  }
  if (parts.length === 2) {
    const availableForFirst = maxLength - ellipsisWidth - separatorWidth - lastWidth;
    return `${truncateToWidthNoEllipsis(first, availableForFirst)}${ellipsis}${separator}${last}`;
  }
  let available = maxLength - firstWidth - lastWidth - ellipsisWidth - 2 * separatorWidth;
  if (available <= 0) {
    const availableForFirst = Math.max(
      0,
      maxLength - lastWidth - ellipsisWidth - 2 * separatorWidth
    );
    const truncatedFirst = truncateToWidthNoEllipsis(first, availableForFirst);
    return `${truncatedFirst}${separator}${ellipsis}${separator}${last}`;
  }
  const middleParts = [];
  for (let i = parts.length - 2; i > 0; i--) {
    const part = parts[i];
    if (part && stringWidth(part) + separatorWidth <= available) {
      middleParts.unshift(part);
      available -= stringWidth(part) + separatorWidth;
    } else {
      break;
    }
  }
  if (middleParts.length === 0) {
    return `${first}${separator}${ellipsis}${separator}${last}`;
  }
  return `${first}${separator}${ellipsis}${separator}${middleParts.join(separator)}${separator}${last}`;
}
let cachedActivity = [];
let cachePromise = null;
async function getRecentActivity() {
  if (cachePromise) {
    return cachePromise;
  }
  const currentSessionId = getSessionId();
  cachePromise = loadMessageLogs(10).then((logs) => {
    cachedActivity = logs.filter((log) => {
      if (log.isSidechain) return false;
      if (log.sessionId === currentSessionId) return false;
      if (log.summary?.includes("I apologize")) return false;
      const hasSummary = log.summary && log.summary !== "No prompt";
      const hasFirstPrompt = log.firstPrompt && log.firstPrompt !== "No prompt";
      return hasSummary || hasFirstPrompt;
    }).slice(0, 3);
    return cachedActivity;
  }).catch(() => {
    cachedActivity = [];
    return cachedActivity;
  });
  return cachePromise;
}
function getRecentActivitySync() {
  return cachedActivity;
}
function formatReleaseNoteForDisplay(note, maxWidth) {
  return truncate(note, maxWidth);
}
function getLogoDisplayData() {
  const version = process.env.DEMO_VERSION ?? "0.0.0";
  const serverUrl = getDirectConnectServerUrl();
  const displayPath = process.env.DEMO_VERSION ? "/code/claude" : getDisplayPath(getCwd());
  const cwd = serverUrl ? `${displayPath} in ${serverUrl.replace(/^https?:\/\//, "")}` : displayPath;
  const billingType = isClaudeAISubscriber() ? getSubscriptionName() : "API Usage Billing";
  const agentName = getInitialSettings().agent;
  return {
    version,
    cwd,
    billingType,
    agentName
  };
}
function formatModelAndBilling(modelName, billingType, availableWidth) {
  const separator = " \xB7 ";
  const combinedWidth = stringWidth(modelName) + separator.length + stringWidth(billingType);
  const shouldSplit = combinedWidth > availableWidth;
  if (shouldSplit) {
    return {
      shouldSplit: true,
      truncatedModel: truncate(modelName, availableWidth),
      truncatedBilling: truncate(billingType, availableWidth)
    };
  }
  return {
    shouldSplit: false,
    truncatedModel: truncate(
      modelName,
      Math.max(
        availableWidth - stringWidth(billingType) - separator.length,
        10
      )
    ),
    truncatedBilling: billingType
  };
}
function getRecentReleaseNotesSync(maxItems) {
  if (process.env.USER_TYPE === "ant") {
    const changelog2 = "";
    if (changelog2) {
      const commits = changelog2.trim().split("\n").filter(Boolean);
      return commits.slice(0, maxItems);
    }
    return [];
  }
  const changelog = getStoredChangelogFromMemory();
  if (!changelog) {
    return [];
  }
  let parsed;
  try {
    parsed = parseChangelog(changelog);
  } catch {
    return [];
  }
  const allNotes = [];
  const versions = Object.keys(parsed).sort((a, b) => gt(a, b) ? -1 : 1).slice(0, 3);
  for (const version of versions) {
    const notes = parsed[version];
    if (notes) {
      allNotes.push(...notes);
    }
  }
  return allNotes.slice(0, maxItems);
}
export {
  calculateLayoutDimensions,
  calculateOptimalLeftWidth,
  formatModelAndBilling,
  formatReleaseNoteForDisplay,
  formatWelcomeMessage,
  getLayoutMode,
  getLogoDisplayData,
  getRecentActivity,
  getRecentActivitySync,
  getRecentReleaseNotesSync,
  truncatePath
};
