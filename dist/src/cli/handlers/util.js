import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { cwd } from "process";
import React from "react";
import { WelcomeV2 } from "../../components/LogoV2/WelcomeV2.js";
import { useManagePlugins } from "../../hooks/useManagePlugins.js";
import { Box, Text } from "../../ink.js";
import { KeybindingSetup } from "../../keybindings/KeybindingProviderSetup.js";
import { logEvent } from "../../services/analytics/index.js";
import { MCPConnectionManager } from "../../services/mcp/MCPConnectionManager.js";
import { AppStateProvider } from "../../state/AppState.js";
import { onChangeAppState } from "../../state/onChangeAppState.js";
import { isAnthropicAuthEnabled } from "../../utils/auth.js";
async function setupTokenHandler(root) {
  logEvent("tengu_setup_token_command", {});
  const showAuthWarning = !isAnthropicAuthEnabled();
  const {
    ConsoleOAuthFlow
  } = await import("../../components/ConsoleOAuthFlow.js");
  await new Promise((resolve) => {
    root.render(/* @__PURE__ */ jsx(AppStateProvider, { onChangeAppState, children: /* @__PURE__ */ jsx(KeybindingSetup, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
      /* @__PURE__ */ jsx(WelcomeV2, {}),
      showAuthWarning && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        /* @__PURE__ */ jsx(Text, { color: "warning", children: "Warning: You already have authentication configured via environment variable or API key helper." }),
        /* @__PURE__ */ jsx(Text, { color: "warning", children: "The setup-token command will create a new OAuth token which you can use instead." })
      ] }),
      /* @__PURE__ */ jsx(ConsoleOAuthFlow, { onDone: () => {
        void resolve();
      }, mode: "setup-token", startingMessage: "This will guide you through long-lived (1-year) auth token setup for your Claude account. Claude subscription required." })
    ] }) }) }));
  });
  root.unmount();
  process.exit(0);
}
const DoctorLazy = React.lazy(() => import("../../screens/Doctor.js").then((m) => ({
  default: m.Doctor
})));
function DoctorWithPlugins(t0) {
  const $ = _c(2);
  const {
    onDone
  } = t0;
  useManagePlugins();
  let t1;
  if ($[0] !== onDone) {
    t1 = /* @__PURE__ */ jsx(React.Suspense, { fallback: null, children: /* @__PURE__ */ jsx(DoctorLazy, { onDone }) });
    $[0] = onDone;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}
async function doctorHandler(root) {
  logEvent("tengu_doctor_command", {});
  await new Promise((resolve) => {
    root.render(/* @__PURE__ */ jsx(AppStateProvider, { children: /* @__PURE__ */ jsx(KeybindingSetup, { children: /* @__PURE__ */ jsx(MCPConnectionManager, { dynamicMcpConfig: void 0, isStrictMcpConfig: false, children: /* @__PURE__ */ jsx(DoctorWithPlugins, { onDone: () => {
      void resolve();
    } }) }) }) }));
  });
  root.unmount();
  process.exit(0);
}
async function installHandler(target, options) {
  const {
    setup
  } = await import("../../setup.js");
  await setup(cwd(), "default", false, false, void 0, false);
  const {
    install
  } = await import("../../commands/install.js");
  await new Promise((resolve) => {
    const args = [];
    if (target) args.push(target);
    if (options.force) args.push("--force");
    void install.call((result) => {
      void resolve();
      process.exit(result.includes("failed") ? 1 : 0);
    }, {}, args);
  });
}
export {
  doctorHandler,
  installHandler,
  setupTokenHandler
};
