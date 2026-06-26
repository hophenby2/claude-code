import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box, Text, color } from "../../ink.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { stringWidth } from "../../ink/stringWidth.js";
import { getLayoutMode, calculateLayoutDimensions, calculateOptimalLeftWidth, formatWelcomeMessage, truncatePath, getRecentActivitySync, getRecentReleaseNotesSync, getLogoDisplayData } from "../../utils/logoV2Utils.js";
import { truncate } from "../../utils/format.js";
import "../../utils/file.js";
import { Clawd } from "./Clawd.js";
import { FeedColumn } from "./FeedColumn.js";
import { createRecentActivityFeed, createWhatsNewFeed, createProjectOnboardingFeed, createGuestPassesFeed } from "./feedConfigs.js";
import { getGlobalConfig, saveGlobalConfig } from "../../utils/config.js";
import { resolveThemeSetting } from "../../utils/systemTheme.js";
import { getInitialSettings } from "../../utils/settings/settings.js";
import { isDebugMode, isDebugToStdErr, getDebugLogPath } from "../../utils/debug.js";
import { useEffect, useState } from "react";
import { getSteps, shouldShowProjectOnboarding, incrementProjectOnboardingSeenCount } from "../../projectOnboardingState.js";
import { CondensedLogo } from "./CondensedLogo.js";
import { OffscreenFreeze } from "../OffscreenFreeze.js";
import { checkForReleaseNotesSync } from "../../utils/releaseNotes.js";
import "../../services/api/dumpPrompts.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
import "../../utils/startupProfiler.js";
import { EmergencyTip } from "./EmergencyTip.js";
import { VoiceModeNotice } from "./VoiceModeNotice.js";
import { Opus1mMergeNotice } from "./Opus1mMergeNotice.js";
const feature = (_name) => false;
const ChannelsNoticeModule = false ? null : null;
import { SandboxManager } from "../../utils/sandbox/sandbox-adapter.js";
import { useShowGuestPassesUpsell, incrementGuestPassesSeenCount } from "./GuestPassesUpsell.js";
import { useShowOverageCreditUpsell, incrementOverageCreditUpsellSeenCount, createOverageCreditFeed } from "./OverageCreditUpsell.js";
import { useAppState } from "../../state/AppState.js";
import { getEffortSuffix } from "../../utils/effort.js";
import { useMainLoopModel } from "../../hooks/useMainLoopModel.js";
import { renderModelSetting } from "../../utils/model/model.js";
const LEFT_PANEL_MAX_WIDTH = 50;
function LogoV2() {
  const $ = _c(94);
  const activities = getRecentActivitySync();
  const username = getGlobalConfig().oauthAccount?.displayName ?? "";
  const {
    columns
  } = useTerminalSize();
  let t0;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t0 = shouldShowProjectOnboarding();
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const showOnboarding = t0;
  let t1;
  if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = SandboxManager.isSandboxingEnabled();
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const showSandboxStatus = t1;
  const showGuestPassesUpsell = useShowGuestPassesUpsell();
  const showOverageCreditUpsell = useShowOverageCreditUpsell();
  const agent = useAppState(_temp);
  const effortValue = useAppState(_temp2);
  const config = getGlobalConfig();
  let changelog;
  try {
    changelog = getRecentReleaseNotesSync(3);
  } catch {
    changelog = [];
  }
  const [announcement] = useState(() => {
    const announcements = getInitialSettings().companyAnnouncements;
    if (!announcements || announcements.length === 0) {
      return;
    }
    return config.numStartups === 1 ? announcements[0] : announcements[Math.floor(Math.random() * announcements.length)];
  });
  const {
    hasReleaseNotes
  } = checkForReleaseNotesSync(config.lastReleaseNotesSeen);
  let t2;
  if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = () => {
      const currentConfig = getGlobalConfig();
      if (currentConfig.lastReleaseNotesSeen === "0.0.0-dev") {
        return;
      }
      saveGlobalConfig(_temp3);
      if (showOnboarding) {
        incrementProjectOnboardingSeenCount();
      }
    };
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== config) {
    t3 = [config, showOnboarding];
    $[3] = config;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  useEffect(t2, t3);
  let t4;
  if ($[5] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t4 = !hasReleaseNotes && !showOnboarding && !isEnvTruthy(process.env.CLAUDE_CODE_FORCE_FULL_LOGO);
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  const isCondensedMode = t4;
  let t5;
  let t6;
  if ($[6] !== showGuestPassesUpsell) {
    t5 = () => {
      if (showGuestPassesUpsell && !showOnboarding && !isCondensedMode) {
        incrementGuestPassesSeenCount();
      }
    };
    t6 = [showGuestPassesUpsell, showOnboarding, isCondensedMode];
    $[6] = showGuestPassesUpsell;
    $[7] = t5;
    $[8] = t6;
  } else {
    t5 = $[7];
    t6 = $[8];
  }
  useEffect(t5, t6);
  let t7;
  let t8;
  if ($[9] !== showGuestPassesUpsell || $[10] !== showOverageCreditUpsell) {
    t7 = () => {
      if (showOverageCreditUpsell && !showOnboarding && !showGuestPassesUpsell && !isCondensedMode) {
        incrementOverageCreditUpsellSeenCount();
      }
    };
    t8 = [showOverageCreditUpsell, showOnboarding, showGuestPassesUpsell, isCondensedMode];
    $[9] = showGuestPassesUpsell;
    $[10] = showOverageCreditUpsell;
    $[11] = t7;
    $[12] = t8;
  } else {
    t7 = $[11];
    t8 = $[12];
  }
  useEffect(t7, t8);
  const model = useMainLoopModel();
  const fullModelDisplayName = renderModelSetting(model);
  const {
    version,
    cwd,
    billingType,
    agentName: agentNameFromSettings
  } = getLogoDisplayData();
  const agentName = agent ?? agentNameFromSettings;
  const effortSuffix = getEffortSuffix(model, effortValue);
  const t9 = fullModelDisplayName + effortSuffix;
  let t10;
  if ($[13] !== t9) {
    t10 = truncate(t9, LEFT_PANEL_MAX_WIDTH - 20);
    $[13] = t9;
    $[14] = t10;
  } else {
    t10 = $[14];
  }
  const modelDisplayName = t10;
  if (!hasReleaseNotes && !showOnboarding && !isEnvTruthy(process.env.CLAUDE_CODE_FORCE_FULL_LOGO)) {
    let t112;
    let t122;
    let t132;
    let t142;
    let t152;
    let t162;
    let t172;
    if ($[15] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t112 = /* @__PURE__ */ jsx(CondensedLogo, {});
      t122 = /* @__PURE__ */ jsx(VoiceModeNotice, {});
      t132 = /* @__PURE__ */ jsx(Opus1mMergeNotice, {});
      t142 = ChannelsNoticeModule && /* @__PURE__ */ jsx(ChannelsNoticeModule.ChannelsNotice, {});
      t152 = isDebugMode() && /* @__PURE__ */ jsxs(Box, { paddingLeft: 2, flexDirection: "column", children: [
        /* @__PURE__ */ jsx(Text, { color: "warning", children: "Debug mode enabled" }),
        /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "Logging to: ",
          isDebugToStdErr() ? "stderr" : getDebugLogPath()
        ] })
      ] });
      t162 = /* @__PURE__ */ jsx(EmergencyTip, {});
      t172 = process.env.CLAUDE_CODE_TMUX_SESSION && /* @__PURE__ */ jsxs(Box, { paddingLeft: 2, flexDirection: "column", children: [
        /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "tmux session: ",
          process.env.CLAUDE_CODE_TMUX_SESSION
        ] }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: process.env.CLAUDE_CODE_TMUX_PREFIX_CONFLICTS ? `Detach: ${process.env.CLAUDE_CODE_TMUX_PREFIX} ${process.env.CLAUDE_CODE_TMUX_PREFIX} d (press prefix twice - Claude uses ${process.env.CLAUDE_CODE_TMUX_PREFIX})` : `Detach: ${process.env.CLAUDE_CODE_TMUX_PREFIX} d` })
      ] });
      $[15] = t112;
      $[16] = t122;
      $[17] = t132;
      $[18] = t142;
      $[19] = t152;
      $[20] = t162;
      $[21] = t172;
    } else {
      t112 = $[15];
      t122 = $[16];
      t132 = $[17];
      t142 = $[18];
      t152 = $[19];
      t162 = $[20];
      t172 = $[21];
    }
    let t182;
    if ($[22] !== announcement || $[23] !== config) {
      t182 = announcement && /* @__PURE__ */ jsxs(Box, { paddingLeft: 2, flexDirection: "column", children: [
        !process.env.IS_DEMO && config.oauthAccount?.organizationName && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "Message from ",
          config.oauthAccount.organizationName,
          ":"
        ] }),
        /* @__PURE__ */ jsx(Text, { children: announcement })
      ] });
      $[22] = announcement;
      $[23] = config;
      $[24] = t182;
    } else {
      t182 = $[24];
    }
    let t192;
    let t202;
    let t212;
    let t222;
    if ($[25] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t192 = false;
      t202 = false;
      t212 = false;
      t222 = false;
      $[25] = t192;
      $[26] = t202;
      $[27] = t212;
      $[28] = t222;
    } else {
      t192 = $[25];
      t202 = $[26];
      t212 = $[27];
      t222 = $[28];
    }
    let t232;
    if ($[29] !== t182) {
      t232 = /* @__PURE__ */ jsxs(Fragment, { children: [
        t112,
        t122,
        t132,
        t142,
        t152,
        t162,
        t172,
        t182,
        t192,
        t202,
        t212,
        t222
      ] });
      $[29] = t182;
      $[30] = t232;
    } else {
      t232 = $[30];
    }
    return t232;
  }
  const layoutMode = getLayoutMode(columns);
  const userTheme = resolveThemeSetting(getGlobalConfig().theme);
  const borderTitle = ` ${color("claude", userTheme)("Claude Code")} ${color("inactive", userTheme)(`v${version}`)} `;
  const compactBorderTitle = color("claude", userTheme)(" Claude Code ");
  if (layoutMode === "compact") {
    let welcomeMessage = formatWelcomeMessage(username);
    if (stringWidth(welcomeMessage) > columns - 4) {
      let t113;
      if ($[31] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t113 = formatWelcomeMessage(null);
        $[31] = t113;
      } else {
        t113 = $[31];
      }
      welcomeMessage = t113;
    }
    const cwdAvailableWidth = agentName ? columns - 4 - 1 - stringWidth(agentName) - 3 : columns - 4;
    const truncatedCwd = truncatePath(cwd, Math.max(cwdAvailableWidth, 10));
    let t112;
    if ($[32] !== compactBorderTitle) {
      t112 = {
        content: compactBorderTitle,
        position: "top",
        align: "start",
        offset: 1
      };
      $[32] = compactBorderTitle;
      $[33] = t112;
    } else {
      t112 = $[33];
    }
    let t122;
    if ($[34] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t122 = /* @__PURE__ */ jsx(Box, { marginY: 1, children: /* @__PURE__ */ jsx(Clawd, {}) });
      $[34] = t122;
    } else {
      t122 = $[34];
    }
    let t132;
    if ($[35] !== modelDisplayName) {
      t132 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: modelDisplayName });
      $[35] = modelDisplayName;
      $[36] = t132;
    } else {
      t132 = $[36];
    }
    let t142;
    let t152;
    let t162;
    if ($[37] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t142 = /* @__PURE__ */ jsx(VoiceModeNotice, {});
      t152 = /* @__PURE__ */ jsx(Opus1mMergeNotice, {});
      t162 = ChannelsNoticeModule && /* @__PURE__ */ jsx(ChannelsNoticeModule.ChannelsNotice, {});
      $[37] = t142;
      $[38] = t152;
      $[39] = t162;
    } else {
      t142 = $[37];
      t152 = $[38];
      t162 = $[39];
    }
    let t172;
    if ($[40] !== showSandboxStatus) {
      t172 = showSandboxStatus && /* @__PURE__ */ jsx(Box, { marginTop: 1, flexDirection: "column", children: /* @__PURE__ */ jsx(Text, { color: "warning", children: "Your bash commands will be sandboxed. Disable with /sandbox." }) });
      $[40] = showSandboxStatus;
      $[41] = t172;
    } else {
      t172 = $[41];
    }
    let t182;
    let t192;
    if ($[42] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t182 = false;
      t192 = false;
      $[42] = t182;
      $[43] = t192;
    } else {
      t182 = $[42];
      t192 = $[43];
    }
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(OffscreenFreeze, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "claude", borderText: t112, paddingX: 1, paddingY: 1, alignItems: "center", width: columns, children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: welcomeMessage }),
        t122,
        t132,
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: billingType }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: agentName ? `@${agentName} \xB7 ${truncatedCwd}` : truncatedCwd })
      ] }) }),
      t142,
      t152,
      t162,
      t172,
      t182,
      t192
    ] });
  }
  const welcomeMessage_0 = formatWelcomeMessage(username);
  const modelLine = !process.env.IS_DEMO && config.oauthAccount?.organizationName ? `${modelDisplayName} \xB7 ${billingType} \xB7 ${config.oauthAccount.organizationName}` : `${modelDisplayName} \xB7 ${billingType}`;
  const cwdAvailableWidth_0 = agentName ? LEFT_PANEL_MAX_WIDTH - 1 - stringWidth(agentName) - 3 : LEFT_PANEL_MAX_WIDTH;
  const truncatedCwd_0 = truncatePath(cwd, Math.max(cwdAvailableWidth_0, 10));
  const cwdLine = agentName ? `@${agentName} \xB7 ${truncatedCwd_0}` : truncatedCwd_0;
  const optimalLeftWidth = calculateOptimalLeftWidth(welcomeMessage_0, cwdLine, modelLine);
  const {
    leftWidth,
    rightWidth
  } = calculateLayoutDimensions(columns, layoutMode, optimalLeftWidth);
  const T0 = OffscreenFreeze;
  const T1 = Box;
  const t11 = "column";
  const t12 = "round";
  const t13 = "claude";
  let t14;
  if ($[44] !== borderTitle) {
    t14 = {
      content: borderTitle,
      position: "top",
      align: "start",
      offset: 3
    };
    $[44] = borderTitle;
    $[45] = t14;
  } else {
    t14 = $[45];
  }
  const T2 = Box;
  const t15 = layoutMode === "horizontal" ? "row" : "column";
  const t16 = 1;
  const t17 = 1;
  let t18;
  if ($[46] !== welcomeMessage_0) {
    t18 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { bold: true, children: welcomeMessage_0 }) });
    $[46] = welcomeMessage_0;
    $[47] = t18;
  } else {
    t18 = $[47];
  }
  let t19;
  if ($[48] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t19 = /* @__PURE__ */ jsx(Clawd, {});
    $[48] = t19;
  } else {
    t19 = $[48];
  }
  let t20;
  if ($[49] !== modelLine) {
    t20 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: modelLine });
    $[49] = modelLine;
    $[50] = t20;
  } else {
    t20 = $[50];
  }
  let t21;
  if ($[51] !== cwdLine) {
    t21 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: cwdLine });
    $[51] = cwdLine;
    $[52] = t21;
  } else {
    t21 = $[52];
  }
  let t22;
  if ($[53] !== t20 || $[54] !== t21) {
    t22 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", alignItems: "center", children: [
      t20,
      t21
    ] });
    $[53] = t20;
    $[54] = t21;
    $[55] = t22;
  } else {
    t22 = $[55];
  }
  let t23;
  if ($[56] !== leftWidth || $[57] !== t18 || $[58] !== t22) {
    t23 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width: leftWidth, justifyContent: "space-between", alignItems: "center", minHeight: 9, children: [
      t18,
      t19,
      t22
    ] });
    $[56] = leftWidth;
    $[57] = t18;
    $[58] = t22;
    $[59] = t23;
  } else {
    t23 = $[59];
  }
  let t24;
  if ($[60] !== layoutMode) {
    t24 = layoutMode === "horizontal" && /* @__PURE__ */ jsx(Box, { height: "100%", borderStyle: "single", borderColor: "claude", borderDimColor: true, borderTop: false, borderBottom: false, borderLeft: false });
    $[60] = layoutMode;
    $[61] = t24;
  } else {
    t24 = $[61];
  }
  const t25 = layoutMode === "horizontal" && /* @__PURE__ */ jsx(FeedColumn, { feeds: showOnboarding ? [createProjectOnboardingFeed(getSteps()), createRecentActivityFeed(activities)] : showGuestPassesUpsell ? [createRecentActivityFeed(activities), createGuestPassesFeed()] : showOverageCreditUpsell ? [createRecentActivityFeed(activities), createOverageCreditFeed()] : [createRecentActivityFeed(activities), createWhatsNewFeed(changelog)], maxWidth: rightWidth });
  let t26;
  if ($[62] !== T2 || $[63] !== t15 || $[64] !== t23 || $[65] !== t24 || $[66] !== t25) {
    t26 = /* @__PURE__ */ jsxs(T2, { flexDirection: t15, paddingX: t16, gap: t17, children: [
      t23,
      t24,
      t25
    ] });
    $[62] = T2;
    $[63] = t15;
    $[64] = t23;
    $[65] = t24;
    $[66] = t25;
    $[67] = t26;
  } else {
    t26 = $[67];
  }
  let t27;
  if ($[68] !== T1 || $[69] !== t14 || $[70] !== t26) {
    t27 = /* @__PURE__ */ jsx(T1, { flexDirection: t11, borderStyle: t12, borderColor: t13, borderText: t14, children: t26 });
    $[68] = T1;
    $[69] = t14;
    $[70] = t26;
    $[71] = t27;
  } else {
    t27 = $[71];
  }
  let t28;
  if ($[72] !== T0 || $[73] !== t27) {
    t28 = /* @__PURE__ */ jsx(T0, { children: t27 });
    $[72] = T0;
    $[73] = t27;
    $[74] = t28;
  } else {
    t28 = $[74];
  }
  let t29;
  let t30;
  let t31;
  let t32;
  let t33;
  let t34;
  if ($[75] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t29 = /* @__PURE__ */ jsx(VoiceModeNotice, {});
    t30 = /* @__PURE__ */ jsx(Opus1mMergeNotice, {});
    t31 = ChannelsNoticeModule && /* @__PURE__ */ jsx(ChannelsNoticeModule.ChannelsNotice, {});
    t32 = isDebugMode() && /* @__PURE__ */ jsxs(Box, { paddingLeft: 2, flexDirection: "column", children: [
      /* @__PURE__ */ jsx(Text, { color: "warning", children: "Debug mode enabled" }),
      /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Logging to: ",
        isDebugToStdErr() ? "stderr" : getDebugLogPath()
      ] })
    ] });
    t33 = /* @__PURE__ */ jsx(EmergencyTip, {});
    t34 = process.env.CLAUDE_CODE_TMUX_SESSION && /* @__PURE__ */ jsxs(Box, { paddingLeft: 2, flexDirection: "column", children: [
      /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "tmux session: ",
        process.env.CLAUDE_CODE_TMUX_SESSION
      ] }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: process.env.CLAUDE_CODE_TMUX_PREFIX_CONFLICTS ? `Detach: ${process.env.CLAUDE_CODE_TMUX_PREFIX} ${process.env.CLAUDE_CODE_TMUX_PREFIX} d (press prefix twice - Claude uses ${process.env.CLAUDE_CODE_TMUX_PREFIX})` : `Detach: ${process.env.CLAUDE_CODE_TMUX_PREFIX} d` })
    ] });
    $[75] = t29;
    $[76] = t30;
    $[77] = t31;
    $[78] = t32;
    $[79] = t33;
    $[80] = t34;
  } else {
    t29 = $[75];
    t30 = $[76];
    t31 = $[77];
    t32 = $[78];
    t33 = $[79];
    t34 = $[80];
  }
  let t35;
  if ($[81] !== announcement || $[82] !== config) {
    t35 = announcement && /* @__PURE__ */ jsxs(Box, { paddingLeft: 2, flexDirection: "column", children: [
      !process.env.IS_DEMO && config.oauthAccount?.organizationName && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Message from ",
        config.oauthAccount.organizationName,
        ":"
      ] }),
      /* @__PURE__ */ jsx(Text, { children: announcement })
    ] });
    $[81] = announcement;
    $[82] = config;
    $[83] = t35;
  } else {
    t35 = $[83];
  }
  let t36;
  if ($[84] !== showSandboxStatus) {
    t36 = showSandboxStatus && /* @__PURE__ */ jsx(Box, { paddingLeft: 2, flexDirection: "column", children: /* @__PURE__ */ jsx(Text, { color: "warning", children: "Your bash commands will be sandboxed. Disable with /sandbox." }) });
    $[84] = showSandboxStatus;
    $[85] = t36;
  } else {
    t36 = $[85];
  }
  let t37;
  let t38;
  let t39;
  let t40;
  if ($[86] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t37 = false;
    t38 = false;
    t39 = false;
    t40 = false;
    $[86] = t37;
    $[87] = t38;
    $[88] = t39;
    $[89] = t40;
  } else {
    t37 = $[86];
    t38 = $[87];
    t39 = $[88];
    t40 = $[89];
  }
  let t41;
  if ($[90] !== t28 || $[91] !== t35 || $[92] !== t36) {
    t41 = /* @__PURE__ */ jsxs(Fragment, { children: [
      t28,
      t29,
      t30,
      t31,
      t32,
      t33,
      t34,
      t35,
      t36,
      t37,
      t38,
      t39,
      t40
    ] });
    $[90] = t28;
    $[91] = t35;
    $[92] = t36;
    $[93] = t41;
  } else {
    t41 = $[93];
  }
  return t41;
}
function _temp3(current) {
  if (current.lastReleaseNotesSeen === "0.0.0-dev") {
    return current;
  }
  return {
    ...current,
    lastReleaseNotesSeen: "0.0.0-dev"
  };
}
function _temp2(s_0) {
  return s_0.effortValue;
}
function _temp(s) {
  return s.agent;
}
export {
  LogoV2
};
