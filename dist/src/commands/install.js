import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { homedir } from "node:os";
import { join } from "node:path";
import { useEffect, useState } from "react";
import { logEvent } from "../services/analytics/index.js";
import { StatusIcon } from "../components/design-system/StatusIcon.js";
import { Box, render, Text } from "../ink.js";
import { logForDebugging } from "../utils/debug.js";
import { env } from "../utils/env.js";
import { errorMessage } from "../utils/errors.js";
import { checkInstall, cleanupNpmInstallations, cleanupShellAliases, installLatest } from "../utils/nativeInstaller/index.js";
import { getInitialSettings, updateSettingsForSource } from "../utils/settings/settings.js";
function getInstallationPath() {
  const isWindows = env.platform === "win32";
  const homeDir = homedir();
  if (isWindows) {
    const windowsPath = join(homeDir, ".local", "bin", "claude.exe");
    return windowsPath.replace(/\//g, "\\");
  }
  return "~/.local/bin/claude";
}
function SetupNotes(t0) {
  const $ = _c(5);
  const {
    messages
  } = t0;
  if (messages.length === 0) {
    return null;
  }
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { color: "warning", children: [
      /* @__PURE__ */ jsx(StatusIcon, { status: "warning", withSpace: true }),
      "Setup notes:"
    ] }) });
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  let t2;
  if ($[1] !== messages) {
    t2 = messages.map(_temp);
    $[1] = messages;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== t2) {
    t3 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 0, marginBottom: 1, children: [
      t1,
      t2
    ] });
    $[3] = t2;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  return t3;
}
function _temp(message, index) {
  return /* @__PURE__ */ jsx(Box, { marginLeft: 2, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
    "\u2022 ",
    message
  ] }) }, index);
}
function Install({
  onDone,
  force,
  target
}) {
  const [state, setState] = useState({
    type: "checking"
  });
  useEffect(() => {
    async function run() {
      try {
        logForDebugging(`Install: Starting installation process (force=${force}, target=${target})`);
        const channelOrVersion = target || getInitialSettings()?.autoUpdatesChannel || "latest";
        setState({
          type: "installing",
          version: channelOrVersion
        });
        logForDebugging(`Install: Calling installLatest(channelOrVersion=${channelOrVersion}, forceReinstall=${force})`);
        const result = await installLatest(channelOrVersion, force);
        logForDebugging(`Install: installLatest returned version=${result.latestVersion}, wasUpdated=${result.wasUpdated}, lockFailed=${result.lockFailed}`);
        if (result.lockFailed) {
          throw new Error("Could not install - another process is currently installing Claude. Please try again in a moment.");
        }
        if (!result.latestVersion) {
          logForDebugging("Install: Failed to retrieve version information during install", {
            level: "error"
          });
        }
        if (!result.wasUpdated) {
          logForDebugging("Install: Already up to date");
        }
        setState({
          type: "setting-up"
        });
        const setupMessages = await checkInstall(true);
        logForDebugging(`Install: Setup launcher completed with ${setupMessages.length} messages`);
        if (setupMessages.length > 0) {
          setupMessages.forEach((msg) => logForDebugging(`Install: Setup message: ${msg.message}`));
        }
        logForDebugging("Install: Cleaning up npm installations after successful install");
        const {
          removed,
          errors,
          warnings
        } = await cleanupNpmInstallations();
        if (removed > 0) {
          logForDebugging(`Cleaned up ${removed} npm installation(s)`);
        }
        if (errors.length > 0) {
          logForDebugging(`Cleanup errors: ${errors.join(", ")}`);
        }
        const aliasMessages = await cleanupShellAliases();
        if (aliasMessages.length > 0) {
          logForDebugging(`Shell alias cleanup: ${aliasMessages.map((m) => m.message).join("; ")}`);
        }
        logEvent("tengu_claude_install_command", {
          has_version: result.latestVersion ? 1 : 0,
          forced: force ? 1 : 0
        });
        if (target === "latest" || target === "stable") {
          updateSettingsForSource("userSettings", {
            autoUpdatesChannel: target
          });
          logForDebugging(`Install: Saved autoUpdatesChannel=${target} to user settings`);
        }
        const allWarnings = [...warnings, ...aliasMessages.map((m_0) => m_0.message)];
        if (setupMessages.length > 0) {
          setState({
            type: "set-up",
            messages: setupMessages.map((m_1) => m_1.message)
          });
          setTimeout(setState, 2e3, {
            type: "success",
            version: result.latestVersion || "current",
            setupMessages: [...setupMessages.map((m_2) => m_2.message), ...allWarnings]
          });
        } else {
          logForDebugging("Install: Shell PATH already configured");
          setState({
            type: "success",
            version: result.latestVersion || "current",
            setupMessages: allWarnings.length > 0 ? allWarnings : void 0
          });
        }
      } catch (error) {
        logForDebugging(`Install command failed: ${error}`, {
          level: "error"
        });
        setState({
          type: "error",
          message: errorMessage(error)
        });
      }
    }
    void run();
  }, [force, target]);
  useEffect(() => {
    if (state.type === "success") {
      setTimeout(onDone, 2e3, "Claude Code installation completed successfully", {
        display: "system"
      });
    } else if (state.type === "error") {
      setTimeout(onDone, 3e3, "Claude Code installation failed", {
        display: "system"
      });
    }
  }, [state, onDone]);
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
    state.type === "checking" && /* @__PURE__ */ jsx(Text, { color: "claude", children: "Checking installation status..." }),
    state.type === "cleaning-npm" && /* @__PURE__ */ jsx(Text, { color: "warning", children: "Cleaning up old npm installations..." }),
    state.type === "installing" && /* @__PURE__ */ jsxs(Text, { color: "claude", children: [
      "Installing Claude Code native build ",
      state.version,
      "..."
    ] }),
    state.type === "setting-up" && /* @__PURE__ */ jsx(Text, { color: "claude", children: "Setting up launcher and shell integration..." }),
    state.type === "set-up" && /* @__PURE__ */ jsx(SetupNotes, { messages: state.messages }),
    state.type === "success" && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
      /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(StatusIcon, { status: "success", withSpace: true }),
        /* @__PURE__ */ jsx(Text, { color: "success", bold: true, children: "Claude Code successfully installed!" })
      ] }),
      /* @__PURE__ */ jsxs(Box, { marginLeft: 2, flexDirection: "column", gap: 1, children: [
        state.version !== "current" && /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Version: " }),
          /* @__PURE__ */ jsx(Text, { color: "claude", children: state.version })
        ] }),
        /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Location: " }),
          /* @__PURE__ */ jsx(Text, { color: "text", children: getInstallationPath() })
        ] })
      ] }),
      /* @__PURE__ */ jsx(Box, { marginLeft: 2, flexDirection: "column", gap: 1, children: /* @__PURE__ */ jsxs(Box, { marginTop: 1, children: [
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Next: Run " }),
        /* @__PURE__ */ jsx(Text, { color: "claude", bold: true, children: "claude --help" }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: " to get started" })
      ] }) }),
      state.setupMessages && /* @__PURE__ */ jsx(SetupNotes, { messages: state.setupMessages })
    ] }),
    state.type === "error" && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
      /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(StatusIcon, { status: "error", withSpace: true }),
        /* @__PURE__ */ jsx(Text, { color: "error", children: "Installation failed" })
      ] }),
      /* @__PURE__ */ jsx(Text, { color: "error", children: state.message }),
      /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Try running with --force to override checks" }) })
    ] })
  ] });
}
const install = {
  type: "local-jsx",
  name: "install",
  description: "Install Claude Code native build",
  argumentHint: "[options]",
  async call(onDone, _context, args) {
    const force = args.includes("--force");
    const nonFlagArgs = args.filter((arg) => !arg.startsWith("--"));
    const target = nonFlagArgs[0];
    const {
      unmount
    } = await render(/* @__PURE__ */ jsx(Install, { onDone: (result, options) => {
      unmount();
      onDone(result, options);
    }, force, target }));
  }
};
export {
  install
};
