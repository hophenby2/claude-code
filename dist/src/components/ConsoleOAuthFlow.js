import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { logEvent } from "../services/analytics/index.js";
import { installOAuthTokens } from "../cli/handlers/auth.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { setClipboard } from "../ink/termio/osc.js";
import { useTerminalNotification } from "../ink/useTerminalNotification.js";
import { Box, Link, Text } from "../ink.js";
import { useKeybinding } from "../keybindings/useKeybinding.js";
import { getSSLErrorHint } from "../services/api/errorUtils.js";
import { sendNotification } from "../services/notifier.js";
import { OAuthService } from "../services/oauth/index.js";
import { getOauthAccountInfo, validateForceLoginOrg } from "../utils/auth.js";
import { logError } from "../utils/log.js";
import { getSettings_DEPRECATED } from "../utils/settings/settings.js";
import { Select } from "./CustomSelect/select.js";
import { KeyboardShortcutHint } from "./design-system/KeyboardShortcutHint.js";
import { Spinner } from "./Spinner.js";
import TextInput from "./TextInput.js";
const PASTE_HERE_MSG = "Paste code here if prompted > ";
function ConsoleOAuthFlow({
  onDone,
  startingMessage,
  mode = "login",
  forceLoginMethod: forceLoginMethodProp
}) {
  const settings = getSettings_DEPRECATED() || {};
  const forceLoginMethod = forceLoginMethodProp ?? settings.forceLoginMethod;
  const orgUUID = settings.forceLoginOrgUUID;
  const forcedMethodMessage = forceLoginMethod === "claudeai" ? "Login method pre-selected: Subscription Plan (Claude Pro/Max)" : forceLoginMethod === "console" ? "Login method pre-selected: API Usage Billing (Anthropic Console)" : null;
  const terminal = useTerminalNotification();
  const [oauthStatus, setOAuthStatus] = useState(() => {
    if (mode === "setup-token") {
      return {
        state: "ready_to_start"
      };
    }
    if (forceLoginMethod === "claudeai" || forceLoginMethod === "console") {
      return {
        state: "ready_to_start"
      };
    }
    return {
      state: "idle"
    };
  });
  const [pastedCode, setPastedCode] = useState("");
  const [cursorOffset, setCursorOffset] = useState(0);
  const [oauthService] = useState(() => new OAuthService());
  const [loginWithClaudeAi, setLoginWithClaudeAi] = useState(() => {
    return mode === "setup-token" || forceLoginMethod === "claudeai";
  });
  const [showPastePrompt, setShowPastePrompt] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const textInputColumns = useTerminalSize().columns - PASTE_HERE_MSG.length - 1;
  useEffect(() => {
    if (forceLoginMethod === "claudeai") {
      logEvent("tengu_oauth_claudeai_forced", {});
    } else if (forceLoginMethod === "console") {
      logEvent("tengu_oauth_console_forced", {});
    }
  }, [forceLoginMethod]);
  useEffect(() => {
    if (oauthStatus.state === "about_to_retry") {
      const timer = setTimeout(setOAuthStatus, 1e3, oauthStatus.nextState);
      return () => clearTimeout(timer);
    }
  }, [oauthStatus]);
  useKeybinding("confirm:yes", () => {
    logEvent("tengu_oauth_success", {
      loginWithClaudeAi
    });
    onDone();
  }, {
    context: "Confirmation",
    isActive: oauthStatus.state === "success" && mode !== "setup-token"
  });
  useKeybinding("confirm:yes", () => {
    setOAuthStatus({
      state: "idle"
    });
  }, {
    context: "Confirmation",
    isActive: oauthStatus.state === "platform_setup"
  });
  useKeybinding("confirm:yes", () => {
    if (oauthStatus.state === "error" && oauthStatus.toRetry) {
      setPastedCode("");
      setOAuthStatus({
        state: "about_to_retry",
        nextState: oauthStatus.toRetry
      });
    }
  }, {
    context: "Confirmation",
    isActive: oauthStatus.state === "error" && !!oauthStatus.toRetry
  });
  useEffect(() => {
    if (pastedCode === "c" && oauthStatus.state === "waiting_for_login" && showPastePrompt && !urlCopied) {
      void setClipboard(oauthStatus.url).then((raw) => {
        if (raw) process.stdout.write(raw);
        setUrlCopied(true);
        setTimeout(setUrlCopied, 2e3, false);
      });
      setPastedCode("");
    }
  }, [pastedCode, oauthStatus, showPastePrompt, urlCopied]);
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
    try {
      logEvent("tengu_oauth_flow_start", {
        loginWithClaudeAi
      });
      const result = await oauthService.startOAuthFlow(async (url_0) => {
        setOAuthStatus({
          state: "waiting_for_login",
          url: url_0
        });
        setTimeout(setShowPastePrompt, 3e3, true);
      }, {
        loginWithClaudeAi,
        inferenceOnly: mode === "setup-token",
        expiresIn: mode === "setup-token" ? 365 * 24 * 60 * 60 : void 0,
        // 1 year for setup-token
        orgUUID
      }).catch((err_1) => {
        const isTokenExchangeError = err_1.message.includes("Token exchange failed");
        const sslHint_0 = getSSLErrorHint(err_1);
        setOAuthStatus({
          state: "error",
          message: sslHint_0 ?? (isTokenExchangeError ? "Failed to exchange authorization code for access token. Please try again." : err_1.message),
          toRetry: mode === "setup-token" ? {
            state: "ready_to_start"
          } : {
            state: "idle"
          }
        });
        logEvent("tengu_oauth_token_exchange_error", {
          error: err_1.message,
          ssl_error: sslHint_0 !== null
        });
        throw err_1;
      });
      if (mode === "setup-token") {
        setOAuthStatus({
          state: "success",
          token: result.accessToken
        });
      } else {
        await installOAuthTokens(result);
        const orgResult = await validateForceLoginOrg();
        if (!orgResult.valid) {
          throw new Error(orgResult.message);
        }
        setOAuthStatus({
          state: "success"
        });
        void sendNotification({
          message: "Claude Code login successful",
          notificationType: "auth_success"
        }, terminal);
      }
    } catch (err_0) {
      const errorMessage = err_0.message;
      const sslHint = getSSLErrorHint(err_0);
      setOAuthStatus({
        state: "error",
        message: sslHint ?? errorMessage,
        toRetry: {
          state: mode === "setup-token" ? "ready_to_start" : "idle"
        }
      });
      logEvent("tengu_oauth_error", {
        error: errorMessage,
        ssl_error: sslHint !== null
      });
    }
  }, [oauthService, setShowPastePrompt, loginWithClaudeAi, mode, orgUUID]);
  const pendingOAuthStartRef = useRef(false);
  useEffect(() => {
    if (oauthStatus.state === "ready_to_start" && !pendingOAuthStartRef.current) {
      pendingOAuthStartRef.current = true;
      process.nextTick((startOAuth_0, pendingOAuthStartRef_0) => {
        void startOAuth_0();
        pendingOAuthStartRef_0.current = false;
      }, startOAuth, pendingOAuthStartRef);
    }
  }, [oauthStatus.state, startOAuth]);
  useEffect(() => {
    if (mode === "setup-token" && oauthStatus.state === "success") {
      const timer_0 = setTimeout((loginWithClaudeAi_0, onDone_0) => {
        logEvent("tengu_oauth_success", {
          loginWithClaudeAi: loginWithClaudeAi_0
        });
        onDone_0();
      }, 500, loginWithClaudeAi, onDone);
      return () => clearTimeout(timer_0);
    }
  }, [mode, oauthStatus, loginWithClaudeAi, onDone]);
  useEffect(() => {
    return () => {
      oauthService.cleanup();
    };
  }, [oauthService]);
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
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
    mode === "setup-token" && oauthStatus.state === "success" && oauthStatus.token && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, paddingTop: 1, children: [
      /* @__PURE__ */ jsx(Text, { color: "success", children: "\u2713 Long-lived authentication token created successfully!" }),
      /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
        /* @__PURE__ */ jsx(Text, { children: "Your OAuth token (valid for 1 year):" }),
        /* @__PURE__ */ jsx(Text, { color: "warning", children: oauthStatus.token }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Store this token securely. You won't be able to see it again." }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Use this token by setting: export CLAUDE_CODE_OAUTH_TOKEN=<token>" })
      ] })
    ] }, "tokenOutput"),
    /* @__PURE__ */ jsx(Box, { paddingLeft: 1, flexDirection: "column", gap: 1, children: /* @__PURE__ */ jsx(OAuthStatusMessage, { oauthStatus, mode, startingMessage, forcedMethodMessage, showPastePrompt, pastedCode, setPastedCode, cursorOffset, setCursorOffset, textInputColumns, handleSubmitCode, setOAuthStatus, setLoginWithClaudeAi }) })
  ] });
}
function OAuthStatusMessage(t0) {
  const $ = _c(51);
  const {
    oauthStatus,
    mode,
    startingMessage,
    forcedMethodMessage,
    showPastePrompt,
    pastedCode,
    setPastedCode,
    cursorOffset,
    setCursorOffset,
    textInputColumns,
    handleSubmitCode,
    setOAuthStatus,
    setLoginWithClaudeAi
  } = t0;
  switch (oauthStatus.state) {
    case "idle": {
      const t1 = startingMessage ? startingMessage : "Claude Code can be used with your Claude subscription or billed based on API usage through your Console account.";
      let t2;
      if ($[0] !== t1) {
        t2 = /* @__PURE__ */ jsx(Text, { bold: true, children: t1 });
        $[0] = t1;
        $[1] = t2;
      } else {
        t2 = $[1];
      }
      let t3;
      if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t3 = /* @__PURE__ */ jsx(Text, { children: "Select login method:" });
        $[2] = t3;
      } else {
        t3 = $[2];
      }
      let t4;
      if ($[3] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t4 = {
          label: /* @__PURE__ */ jsxs(Text, { children: [
            "Claude account with subscription \xB7",
            " ",
            /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Pro, Max, Team, or Enterprise" }),
            false,
            "\n"
          ] }),
          value: "claudeai"
        };
        $[3] = t4;
      } else {
        t4 = $[3];
      }
      let t5;
      if ($[4] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t5 = {
          label: /* @__PURE__ */ jsxs(Text, { children: [
            "Anthropic Console account \xB7",
            " ",
            /* @__PURE__ */ jsx(Text, { dimColor: true, children: "API usage billing" }),
            "\n"
          ] }),
          value: "console"
        };
        $[4] = t5;
      } else {
        t5 = $[4];
      }
      let t6;
      if ($[5] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t6 = [t4, t5, {
          label: /* @__PURE__ */ jsxs(Text, { children: [
            "3rd-party platform \xB7",
            " ",
            /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Amazon Bedrock, Microsoft Foundry, or Vertex AI" }),
            "\n"
          ] }),
          value: "platform"
        }];
        $[5] = t6;
      } else {
        t6 = $[5];
      }
      let t7;
      if ($[6] !== setLoginWithClaudeAi || $[7] !== setOAuthStatus) {
        t7 = /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Select, { options: t6, onChange: (value_0) => {
          if (value_0 === "platform") {
            logEvent("tengu_oauth_platform_selected", {});
            setOAuthStatus({
              state: "platform_setup"
            });
          } else {
            setOAuthStatus({
              state: "ready_to_start"
            });
            if (value_0 === "claudeai") {
              logEvent("tengu_oauth_claudeai_selected", {});
              setLoginWithClaudeAi(true);
            } else {
              logEvent("tengu_oauth_console_selected", {});
              setLoginWithClaudeAi(false);
            }
          }
        } }) });
        $[6] = setLoginWithClaudeAi;
        $[7] = setOAuthStatus;
        $[8] = t7;
      } else {
        t7 = $[8];
      }
      let t8;
      if ($[9] !== t2 || $[10] !== t7) {
        t8 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, marginTop: 1, children: [
          t2,
          t3,
          t7
        ] });
        $[9] = t2;
        $[10] = t7;
        $[11] = t8;
      } else {
        t8 = $[11];
      }
      return t8;
    }
    case "platform_setup": {
      let t1;
      if ($[12] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t1 = /* @__PURE__ */ jsx(Text, { bold: true, children: "Using 3rd-party platforms" });
        $[12] = t1;
      } else {
        t1 = $[12];
      }
      let t2;
      let t3;
      if ($[13] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t2 = /* @__PURE__ */ jsx(Text, { children: "Claude Code supports Amazon Bedrock, Microsoft Foundry, and Vertex AI. Set the required environment variables, then restart Claude Code." });
        t3 = /* @__PURE__ */ jsx(Text, { children: "If you are part of an enterprise organization, contact your administrator for setup instructions." });
        $[13] = t2;
        $[14] = t3;
      } else {
        t2 = $[13];
        t3 = $[14];
      }
      let t4;
      if ($[15] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t4 = /* @__PURE__ */ jsx(Text, { bold: true, children: "Documentation:" });
        $[15] = t4;
      } else {
        t4 = $[15];
      }
      let t5;
      if ($[16] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t5 = /* @__PURE__ */ jsxs(Text, { children: [
          "\xB7 Amazon Bedrock:",
          " ",
          /* @__PURE__ */ jsx(Link, { url: "https://code.claude.com/docs/en/amazon-bedrock", children: "https://code.claude.com/docs/en/amazon-bedrock" })
        ] });
        $[16] = t5;
      } else {
        t5 = $[16];
      }
      let t6;
      if ($[17] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t6 = /* @__PURE__ */ jsxs(Text, { children: [
          "\xB7 Microsoft Foundry:",
          " ",
          /* @__PURE__ */ jsx(Link, { url: "https://code.claude.com/docs/en/microsoft-foundry", children: "https://code.claude.com/docs/en/microsoft-foundry" })
        ] });
        $[17] = t6;
      } else {
        t6 = $[17];
      }
      let t7;
      if ($[18] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t7 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
          t4,
          t5,
          t6,
          /* @__PURE__ */ jsxs(Text, { children: [
            "\xB7 Vertex AI:",
            " ",
            /* @__PURE__ */ jsx(Link, { url: "https://code.claude.com/docs/en/google-vertex-ai", children: "https://code.claude.com/docs/en/google-vertex-ai" })
          ] })
        ] });
        $[18] = t7;
      } else {
        t7 = $[18];
      }
      let t8;
      if ($[19] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t8 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, marginTop: 1, children: [
          t1,
          /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
            t2,
            t3,
            t7,
            /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
              "Press ",
              /* @__PURE__ */ jsx(Text, { bold: true, children: "Enter" }),
              " to go back to login options."
            ] }) })
          ] })
        ] });
        $[19] = t8;
      } else {
        t8 = $[19];
      }
      return t8;
    }
    case "waiting_for_login": {
      let t1;
      if ($[20] !== forcedMethodMessage) {
        t1 = forcedMethodMessage && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: forcedMethodMessage }) });
        $[20] = forcedMethodMessage;
        $[21] = t1;
      } else {
        t1 = $[21];
      }
      let t2;
      if ($[22] !== showPastePrompt) {
        t2 = !showPastePrompt && /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Spinner, {}),
          /* @__PURE__ */ jsx(Text, { children: "Opening browser to sign in\u2026" })
        ] });
        $[22] = showPastePrompt;
        $[23] = t2;
      } else {
        t2 = $[23];
      }
      let t3;
      if ($[24] !== cursorOffset || $[25] !== handleSubmitCode || $[26] !== oauthStatus.url || $[27] !== pastedCode || $[28] !== setCursorOffset || $[29] !== setPastedCode || $[30] !== showPastePrompt || $[31] !== textInputColumns) {
        t3 = showPastePrompt && /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Text, { children: PASTE_HERE_MSG }),
          /* @__PURE__ */ jsx(TextInput, { value: pastedCode, onChange: setPastedCode, onSubmit: (value) => handleSubmitCode(value, oauthStatus.url), cursorOffset, onChangeCursorOffset: setCursorOffset, columns: textInputColumns, mask: "*" })
        ] });
        $[24] = cursorOffset;
        $[25] = handleSubmitCode;
        $[26] = oauthStatus.url;
        $[27] = pastedCode;
        $[28] = setCursorOffset;
        $[29] = setPastedCode;
        $[30] = showPastePrompt;
        $[31] = textInputColumns;
        $[32] = t3;
      } else {
        t3 = $[32];
      }
      let t4;
      if ($[33] !== t1 || $[34] !== t2 || $[35] !== t3) {
        t4 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
          t1,
          t2,
          t3
        ] });
        $[33] = t1;
        $[34] = t2;
        $[35] = t3;
        $[36] = t4;
      } else {
        t4 = $[36];
      }
      return t4;
    }
    case "creating_api_key": {
      let t1;
      if ($[37] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t1 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", gap: 1, children: /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Spinner, {}),
          /* @__PURE__ */ jsx(Text, { children: "Creating API key for Claude Code\u2026" })
        ] }) });
        $[37] = t1;
      } else {
        t1 = $[37];
      }
      return t1;
    }
    case "about_to_retry": {
      let t1;
      if ($[38] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t1 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", gap: 1, children: /* @__PURE__ */ jsx(Text, { color: "permission", children: "Retrying\u2026" }) });
        $[38] = t1;
      } else {
        t1 = $[38];
      }
      return t1;
    }
    case "success": {
      let t1;
      if ($[39] !== mode || $[40] !== oauthStatus.token) {
        t1 = mode === "setup-token" && oauthStatus.token ? null : /* @__PURE__ */ jsxs(Fragment, { children: [
          getOauthAccountInfo()?.emailAddress ? /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
            "Logged in as",
            " ",
            /* @__PURE__ */ jsx(Text, { children: getOauthAccountInfo()?.emailAddress })
          ] }) : null,
          /* @__PURE__ */ jsxs(Text, { color: "success", children: [
            "Login successful. Press ",
            /* @__PURE__ */ jsx(Text, { bold: true, children: "Enter" }),
            " to continue\u2026"
          ] })
        ] });
        $[39] = mode;
        $[40] = oauthStatus.token;
        $[41] = t1;
      } else {
        t1 = $[41];
      }
      let t2;
      if ($[42] !== t1) {
        t2 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: t1 });
        $[42] = t1;
        $[43] = t2;
      } else {
        t2 = $[43];
      }
      return t2;
    }
    case "error": {
      let t1;
      if ($[44] !== oauthStatus.message) {
        t1 = /* @__PURE__ */ jsxs(Text, { color: "error", children: [
          "OAuth error: ",
          oauthStatus.message
        ] });
        $[44] = oauthStatus.message;
        $[45] = t1;
      } else {
        t1 = $[45];
      }
      let t2;
      if ($[46] !== oauthStatus.toRetry) {
        t2 = oauthStatus.toRetry && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { color: "permission", children: [
          "Press ",
          /* @__PURE__ */ jsx(Text, { bold: true, children: "Enter" }),
          " to retry."
        ] }) });
        $[46] = oauthStatus.toRetry;
        $[47] = t2;
      } else {
        t2 = $[47];
      }
      let t3;
      if ($[48] !== t1 || $[49] !== t2) {
        t3 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
          t1,
          t2
        ] });
        $[48] = t1;
        $[49] = t2;
        $[50] = t3;
      } else {
        t3 = $[50];
      }
      return t3;
    }
    default: {
      return null;
    }
  }
}
export {
  ConsoleOAuthFlow
};
