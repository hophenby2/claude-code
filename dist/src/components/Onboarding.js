import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { logEvent } from "../services/analytics/index.js";
import { setupTerminal, shouldOfferTerminalSetup } from "../commands/terminalSetup/terminalSetup.js";
import { useExitOnCtrlCDWithKeybindings } from "../hooks/useExitOnCtrlCDWithKeybindings.js";
import { Box, Link, Newline, Text, useTheme } from "../ink.js";
import { useKeybindings } from "../keybindings/useKeybinding.js";
import { isAnthropicAuthEnabled } from "../utils/auth.js";
import { normalizeApiKeyForConfig } from "../utils/authPortable.js";
import { getCustomApiKeyStatus } from "../utils/config.js";
import { env } from "../utils/env.js";
import { isRunningOnHomespace } from "../utils/envUtils.js";
import { PreflightStep } from "../utils/preflightChecks.js";
import { ApproveApiKey } from "./ApproveApiKey.js";
import { ConsoleOAuthFlow } from "./ConsoleOAuthFlow.js";
import { Select } from "./CustomSelect/select.js";
import { WelcomeV2 } from "./LogoV2/WelcomeV2.js";
import { PressEnterToContinue } from "./PressEnterToContinue.js";
import { ThemePicker } from "./ThemePicker.js";
import { OrderedList } from "./ui/OrderedList.js";
function Onboarding({
  onDone
}) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [skipOAuth, setSkipOAuth] = useState(false);
  const [oauthEnabled] = useState(() => isAnthropicAuthEnabled());
  const [theme, setTheme] = useTheme();
  useEffect(() => {
    logEvent("tengu_began_setup", {
      oauthEnabled
    });
  }, [oauthEnabled]);
  function goToNextStep() {
    if (currentStepIndex < steps.length - 1) {
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);
      logEvent("tengu_onboarding_step", {
        oauthEnabled,
        stepId: steps[nextIndex]?.id
      });
    } else {
      onDone();
    }
  }
  function handleThemeSelection(newTheme) {
    setTheme(newTheme);
    goToNextStep();
  }
  const exitState = useExitOnCtrlCDWithKeybindings();
  const themeStep = /* @__PURE__ */ jsx(Box, { marginX: 1, children: /* @__PURE__ */ jsx(
    ThemePicker,
    {
      onThemeSelect: handleThemeSelection,
      showIntroText: true,
      helpText: "To change this later, run /theme",
      hideEscToCancel: true,
      skipExitHandling: true
    }
  ) });
  const securityStep = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, paddingLeft: 1, children: [
    /* @__PURE__ */ jsx(Text, { bold: true, children: "Security notes:" }),
    /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: 70, children: /* @__PURE__ */ jsxs(OrderedList, { children: [
      /* @__PURE__ */ jsxs(OrderedList.Item, { children: [
        /* @__PURE__ */ jsx(Text, { children: "Claude can make mistakes" }),
        /* @__PURE__ */ jsxs(Text, { dimColor: true, wrap: "wrap", children: [
          "You should always review Claude's responses, especially when",
          /* @__PURE__ */ jsx(Newline, {}),
          "running code.",
          /* @__PURE__ */ jsx(Newline, {})
        ] })
      ] }),
      /* @__PURE__ */ jsxs(OrderedList.Item, { children: [
        /* @__PURE__ */ jsx(Text, { children: "Due to prompt injection risks, only use it with code you trust" }),
        /* @__PURE__ */ jsxs(Text, { dimColor: true, wrap: "wrap", children: [
          "For more details see:",
          /* @__PURE__ */ jsx(Newline, {}),
          /* @__PURE__ */ jsx(Link, { url: "https://code.claude.com/docs/en/security" })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(PressEnterToContinue, {})
  ] });
  const preflightStep = /* @__PURE__ */ jsx(PreflightStep, { onSuccess: goToNextStep });
  const apiKeyNeedingApproval = useMemo(() => {
    if (!process.env.ANTHROPIC_API_KEY || isRunningOnHomespace()) {
      return "";
    }
    const customApiKeyTruncated = normalizeApiKeyForConfig(process.env.ANTHROPIC_API_KEY);
    if (getCustomApiKeyStatus(customApiKeyTruncated) === "new") {
      return customApiKeyTruncated;
    }
  }, []);
  function handleApiKeyDone(approved) {
    if (approved) {
      setSkipOAuth(true);
    }
    goToNextStep();
  }
  const steps = [];
  if (oauthEnabled) {
    steps.push({
      id: "preflight",
      component: preflightStep
    });
  }
  steps.push({
    id: "theme",
    component: themeStep
  });
  if (apiKeyNeedingApproval) {
    steps.push({
      id: "api-key",
      component: /* @__PURE__ */ jsx(ApproveApiKey, { customApiKeyTruncated: apiKeyNeedingApproval, onDone: handleApiKeyDone })
    });
  }
  if (oauthEnabled) {
    steps.push({
      id: "oauth",
      component: /* @__PURE__ */ jsx(SkippableStep, { skip: skipOAuth, onSkip: goToNextStep, children: /* @__PURE__ */ jsx(ConsoleOAuthFlow, { onDone: goToNextStep }) })
    });
  }
  steps.push({
    id: "security",
    component: securityStep
  });
  if (shouldOfferTerminalSetup()) {
    steps.push({
      id: "terminal-setup",
      component: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, paddingLeft: 1, children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: "Use Claude Code's terminal setup?" }),
        /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width: 70, gap: 1, children: [
          /* @__PURE__ */ jsxs(Text, { children: [
            "For the optimal coding experience, enable the recommended settings",
            /* @__PURE__ */ jsx(Newline, {}),
            "for your terminal:",
            " ",
            env.terminal === "Apple_Terminal" ? "Option+Enter for newlines and visual bell" : "Shift+Enter for newlines"
          ] }),
          /* @__PURE__ */ jsx(Select, { options: [{
            label: "Yes, use recommended settings",
            value: "install"
          }, {
            label: "No, maybe later with /terminal-setup",
            value: "no"
          }], onChange: (value) => {
            if (value === "install") {
              void setupTerminal(theme).catch(() => {
              }).finally(goToNextStep);
            } else {
              goToNextStep();
            }
          }, onCancel: () => goToNextStep() }),
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: exitState.pending ? /* @__PURE__ */ jsxs(Fragment, { children: [
            "Press ",
            exitState.keyName,
            " again to exit"
          ] }) : /* @__PURE__ */ jsx(Fragment, { children: "Enter to confirm \xB7 Esc to skip" }) })
        ] })
      ] })
    });
  }
  const currentStep = steps[currentStepIndex];
  const handleSecurityContinue = useCallback(() => {
    if (currentStepIndex === steps.length - 1) {
      onDone();
    } else {
      goToNextStep();
    }
  }, [currentStepIndex, steps.length, oauthEnabled, onDone]);
  const handleTerminalSetupSkip = useCallback(() => {
    goToNextStep();
  }, [currentStepIndex, steps.length, oauthEnabled, onDone]);
  useKeybindings({
    "confirm:yes": handleSecurityContinue
  }, {
    context: "Confirmation",
    isActive: currentStep?.id === "security"
  });
  useKeybindings({
    "confirm:no": handleTerminalSetupSkip
  }, {
    context: "Confirmation",
    isActive: currentStep?.id === "terminal-setup"
  });
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx(WelcomeV2, {}),
    /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
      currentStep?.component,
      exitState.pending && /* @__PURE__ */ jsx(Box, { padding: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Press ",
        exitState.keyName,
        " again to exit"
      ] }) })
    ] })
  ] });
}
function SkippableStep(t0) {
  const $ = _c(4);
  const {
    skip,
    onSkip,
    children
  } = t0;
  let t1;
  let t2;
  if ($[0] !== onSkip || $[1] !== skip) {
    t1 = () => {
      if (skip) {
        onSkip();
      }
    };
    t2 = [skip, onSkip];
    $[0] = onSkip;
    $[1] = skip;
    $[2] = t1;
    $[3] = t2;
  } else {
    t1 = $[2];
    t2 = $[3];
  }
  useEffect(t1, t2);
  if (skip) {
    return null;
  }
  return children;
}
export {
  Onboarding,
  SkippableStep
};
