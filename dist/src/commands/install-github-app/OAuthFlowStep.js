import { jsx, jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { logEvent } from "../../services/analytics/index.js";
import { KeyboardShortcutHint } from "../../components/design-system/KeyboardShortcutHint.js";
import { Spinner } from "../../components/Spinner.js";
import TextInput from "../../components/TextInput.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { setClipboard } from "../../ink/termio/osc.js";
import { Box, Link, Text } from "../../ink.js";
import { OAuthService } from "../../services/oauth/index.js";
import { saveOAuthTokensIfNeeded } from "../../utils/auth.js";
import { logError } from "../../utils/log.js";
const PASTE_HERE_MSG = "Paste code here if prompted > ";
function OAuthFlowStep({
  onSuccess,
  onCancel
}) {
  const [oauthStatus, setOAuthStatus] = useState({
    state: "starting"
  });
  const [oauthService] = useState(() => new OAuthService());
  const [pastedCode, setPastedCode] = useState("");
  const [cursorOffset, setCursorOffset] = useState(0);
  const [showPastePrompt, setShowPastePrompt] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const timersRef = useRef(/* @__PURE__ */ new Set());
  const urlCopiedTimerRef = useRef(void 0);
  const terminalSize = useTerminalSize();
  const textInputColumns = Math.max(50, terminalSize.columns - PASTE_HERE_MSG.length - 4);
  function handleKeyDown(e) {
    if (oauthStatus.state !== "error") return;
    e.preventDefault();
    if (e.key === "return" && oauthStatus.toRetry) {
      setPastedCode("");
      setCursorOffset(0);
      setOAuthStatus({
        state: "about_to_retry",
        nextState: oauthStatus.toRetry
      });
    } else {
      onCancel();
    }
  }
  async function handleSubmitCode(value, url) {
    try {
      const [authorizationCode, state] = value.split("#");
      if (!authorizationCode || !state) {
        setOAuthStatus({
          state: "error",
          message: "Invalid code. Please make sure the full code was copied",
          toRetry: {
            state: "waiting_for_login",
            url
          }
        });
        return;
      }
      logEvent("tengu_oauth_manual_entry", {});
      oauthService.handleManualAuthCodeInput({
        authorizationCode,
        state
      });
    } catch (err) {
      logError(err);
      setOAuthStatus({
        state: "error",
        message: err.message,
        toRetry: {
          state: "waiting_for_login",
          url
        }
      });
    }
  }
  const startOAuth = useCallback(async () => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    try {
      const result = await oauthService.startOAuthFlow(async (url_0) => {
        setOAuthStatus({
          state: "waiting_for_login",
          url: url_0
        });
        const timer_0 = setTimeout(setShowPastePrompt, 3e3, true);
        timersRef.current.add(timer_0);
      }, {
        loginWithClaudeAi: true,
        // Always use Claude AI for subscription tokens
        inferenceOnly: true,
        expiresIn: 365 * 24 * 60 * 60
        // 1 year
      });
      setOAuthStatus({
        state: "processing"
      });
      saveOAuthTokensIfNeeded(result);
      const timer1 = setTimeout((setOAuthStatus_0, accessToken, onSuccess_0, timersRef_0) => {
        setOAuthStatus_0({
          state: "success",
          token: accessToken
        });
        const timer2 = setTimeout(onSuccess_0, 1e3, accessToken);
        timersRef_0.current.add(timer2);
      }, 100, setOAuthStatus, result.accessToken, onSuccess, timersRef);
      timersRef.current.add(timer1);
    } catch (err_0) {
      const errorMessage = err_0.message;
      setOAuthStatus({
        state: "error",
        message: errorMessage,
        toRetry: {
          state: "starting"
        }
        // Allow retry by starting fresh OAuth flow
      });
      logError(err_0);
      logEvent("tengu_oauth_error", {
        error: errorMessage
      });
    }
  }, [oauthService, onSuccess]);
  useEffect(() => {
    if (oauthStatus.state === "starting") {
      void startOAuth();
    }
  }, [oauthStatus.state, startOAuth]);
  useEffect(() => {
    if (oauthStatus.state === "about_to_retry") {
      const timer_1 = setTimeout((nextState, setShowPastePrompt_0, setOAuthStatus_1) => {
        setShowPastePrompt_0(nextState.state === "waiting_for_login");
        setOAuthStatus_1(nextState);
      }, 500, oauthStatus.nextState, setShowPastePrompt, setOAuthStatus);
      timersRef.current.add(timer_1);
    }
  }, [oauthStatus]);
  useEffect(() => {
    if (pastedCode === "c" && oauthStatus.state === "waiting_for_login" && showPastePrompt && !urlCopied) {
      void setClipboard(oauthStatus.url).then((raw) => {
        if (raw) process.stdout.write(raw);
        setUrlCopied(true);
        clearTimeout(urlCopiedTimerRef.current);
        urlCopiedTimerRef.current = setTimeout(setUrlCopied, 2e3, false);
      });
      setPastedCode("");
    }
  }, [pastedCode, oauthStatus, showPastePrompt, urlCopied]);
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      oauthService.cleanup();
      timers.forEach((timer_2) => clearTimeout(timer_2));
      timers.clear();
      clearTimeout(urlCopiedTimerRef.current);
    };
  }, [oauthService]);
  function renderStatusMessage() {
    switch (oauthStatus.state) {
      case "starting":
        return /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Spinner, {}),
          /* @__PURE__ */ jsx(Text, { children: "Starting authentication\u2026" })
        ] });
      case "waiting_for_login":
        return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
          !showPastePrompt && /* @__PURE__ */ jsxs(Box, { children: [
            /* @__PURE__ */ jsx(Spinner, {}),
            /* @__PURE__ */ jsx(Text, { children: "Opening browser to sign in with your Claude account\u2026" })
          ] }),
          showPastePrompt && /* @__PURE__ */ jsxs(Box, { children: [
            /* @__PURE__ */ jsx(Text, { children: PASTE_HERE_MSG }),
            /* @__PURE__ */ jsx(TextInput, { value: pastedCode, onChange: setPastedCode, onSubmit: (value_0) => handleSubmitCode(value_0, oauthStatus.url), cursorOffset, onChangeCursorOffset: setCursorOffset, columns: textInputColumns })
          ] })
        ] });
      case "processing":
        return /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Spinner, {}),
          /* @__PURE__ */ jsx(Text, { children: "Processing authentication\u2026" })
        ] });
      case "success":
        return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
          /* @__PURE__ */ jsx(Text, { color: "success", children: "\u2713 Authentication token created successfully!" }),
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Using token for GitHub Actions setup\u2026" })
        ] });
      case "error":
        return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
          /* @__PURE__ */ jsxs(Text, { color: "error", children: [
            "OAuth error: ",
            oauthStatus.message
          ] }),
          oauthStatus.toRetry ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Press Enter to try again, or any other key to cancel" }) : /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Press any key to return to API key selection" })
        ] });
      case "about_to_retry":
        return /* @__PURE__ */ jsx(Box, { flexDirection: "column", gap: 1, children: /* @__PURE__ */ jsx(Text, { color: "permission", children: "Retrying\u2026" }) });
      default:
        return null;
    }
  }
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, tabIndex: 0, autoFocus: true, onKeyDown: handleKeyDown, children: [
    oauthStatus.state === "starting" && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, paddingBottom: 1, children: [
      /* @__PURE__ */ jsx(Text, { bold: true, children: "Create Authentication Token" }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Creating a long-lived token for GitHub Actions" })
    ] }),
    oauthStatus.state !== "success" && oauthStatus.state !== "starting" && oauthStatus.state !== "processing" && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, paddingBottom: 1, children: [
      /* @__PURE__ */ jsx(Text, { bold: true, children: "Create Authentication Token" }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Creating a long-lived token for GitHub Actions" })
    ] }, "header"),
    oauthStatus.state === "waiting_for_login" && showPastePrompt && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, paddingBottom: 1, children: [
      /* @__PURE__ */ jsxs(Box, { paddingX: 1, children: [
        /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          "Browser didn't open? Use the url below to sign in",
          " "
        ] }),
        urlCopied ? /* @__PURE__ */ jsx(Text, { color: "success", children: "(Copied!)" }) : /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "c", action: "copy", parens: true }) })
      ] }),
      /* @__PURE__ */ jsx(Link, { url: oauthStatus.url, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: oauthStatus.url }) })
    ] }, "urlToCopy"),
    /* @__PURE__ */ jsx(Box, { paddingLeft: 1, flexDirection: "column", gap: 1, children: renderStatusMessage() })
  ] });
}
export {
  OAuthFlowStep
};
