import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import figures from "figures";
import { homedir } from "os";
import { Box, Text } from "../../ink.js";
import { formatCreditAmount, getCachedReferrerReward } from "../../services/api/referral.js";
import { getCwd } from "../../utils/cwd.js";
import { formatRelativeTimeAgo } from "../../utils/format.js";
function createRecentActivityFeed(activities) {
  const lines = activities.map((log) => {
    const time = formatRelativeTimeAgo(log.modified);
    const description = log.summary && log.summary !== "No prompt" ? log.summary : log.firstPrompt;
    return {
      text: description || "",
      timestamp: time
    };
  });
  return {
    title: "Recent activity",
    lines,
    footer: lines.length > 0 ? "/resume for more" : void 0,
    emptyMessage: "No recent activity"
  };
}
function createWhatsNewFeed(releaseNotes) {
  const lines = releaseNotes.map((note) => {
    if (false) {
      const match = note.match(/^(\d+\s+\w+\s+ago)\s+(.+)$/);
      if (match) {
        return {
          timestamp: match[1],
          text: match[2] || ""
        };
      }
    }
    return {
      text: note
    };
  });
  const emptyMessage = false ? "Unable to fetch latest claude-cli-internal commits" : "Check the Claude Code changelog for updates";
  return {
    title: false ? "What's new [ANT-ONLY: Latest CC commits]" : "What's new",
    lines,
    footer: lines.length > 0 ? "/release-notes for more" : void 0,
    emptyMessage
  };
}
function createProjectOnboardingFeed(steps) {
  const enabledSteps = steps.filter(({
    isEnabled
  }) => isEnabled).sort((a, b) => Number(a.isComplete) - Number(b.isComplete));
  const lines = enabledSteps.map(({
    text,
    isComplete
  }) => {
    const checkmark = isComplete ? `${figures.tick} ` : "";
    return {
      text: `${checkmark}${text}`
    };
  });
  const warningText = getCwd() === homedir() ? "Note: You have launched claude in your home directory. For the best experience, launch it in a project directory instead." : void 0;
  if (warningText) {
    lines.push({
      text: warningText
    });
  }
  return {
    title: "Tips for getting started",
    lines
  };
}
function createGuestPassesFeed() {
  const reward = getCachedReferrerReward();
  const subtitle = reward ? `Share Claude Code and earn ${formatCreditAmount(reward)} of extra usage` : "Share Claude Code with friends";
  return {
    title: "3 guest passes",
    lines: [],
    customContent: {
      content: /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Box, { marginY: 1, children: /* @__PURE__ */ jsx(Text, { color: "claude", children: "[\u273B] [\u273B] [\u273B]" }) }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: subtitle })
      ] }),
      width: 48
    },
    footer: "/passes"
  };
}
export {
  createGuestPassesFeed,
  createProjectOnboardingFeed,
  createRecentActivityFeed,
  createWhatsNewFeed
};
