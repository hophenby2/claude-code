import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { logEvent } from "../services/analytics/index.js";
import { useInterval } from "usehooks-ts";
import { useUpdateNotification } from "../hooks/useUpdateNotification.js";
import { Box, Text } from "../ink.js";
import { getLatestVersion, getMaxVersion, installGlobalPackage, shouldSkipVersion } from "../utils/autoUpdater.js";
import { getGlobalConfig, isAutoUpdaterDisabled } from "../utils/config.js";
import { logForDebugging } from "../utils/debug.js";
import { getCurrentInstallationType } from "../utils/doctorDiagnostic.js";
import { installOrUpdateClaudePackage, localInstallationExists } from "../utils/localInstaller.js";
import { removeInstalledSymlink } from "../utils/nativeInstaller/index.js";
import { gt, gte } from "../utils/semver.js";
import { getInitialSettings } from "../utils/settings/settings.js";
function AutoUpdater({
  isUpdating,
  onChangeIsUpdating,
  onAutoUpdaterResult,
  autoUpdaterResult,
  showSuccessMessage,
  verbose
}) {
  const [versions, setVersions] = useState({});
  const [hasLocalInstall, setHasLocalInstall] = useState(false);
  const updateSemver = useUpdateNotification(autoUpdaterResult?.version);
  useEffect(() => {
    void localInstallationExists().then(setHasLocalInstall);
  }, []);
  const isUpdatingRef = useRef(isUpdating);
  isUpdatingRef.current = isUpdating;
  const checkForUpdates = React.useCallback(async () => {
    if (isUpdatingRef.current) {
      return;
    }
    if (false) {
      logForDebugging("AutoUpdater: Skipping update check in test/dev environment");
      return;
    }
    const currentVersion = "0.0.0-dev";
    const channel = getInitialSettings()?.autoUpdatesChannel ?? "latest";
    let latestVersion = await getLatestVersion(channel);
    const isDisabled = isAutoUpdaterDisabled();
    const maxVersion = await getMaxVersion();
    if (maxVersion && latestVersion && gt(latestVersion, maxVersion)) {
      logForDebugging(`AutoUpdater: maxVersion ${maxVersion} is set, capping update from ${latestVersion} to ${maxVersion}`);
      if (gte(currentVersion, maxVersion)) {
        logForDebugging(`AutoUpdater: current version ${currentVersion} is already at or above maxVersion ${maxVersion}, skipping update`);
        setVersions({
          global: currentVersion,
          latest: latestVersion
        });
        return;
      }
      latestVersion = maxVersion;
    }
    setVersions({
      global: currentVersion,
      latest: latestVersion
    });
    if (!isDisabled && currentVersion && latestVersion && !gte(currentVersion, latestVersion) && !shouldSkipVersion(latestVersion)) {
      const startTime = Date.now();
      onChangeIsUpdating(true);
      const config = getGlobalConfig();
      if (config.installMethod !== "native") {
        await removeInstalledSymlink();
      }
      const installationType = await getCurrentInstallationType();
      logForDebugging(`AutoUpdater: Detected installation type: ${installationType}`);
      if (installationType === "development") {
        logForDebugging("AutoUpdater: Cannot auto-update development build");
        onChangeIsUpdating(false);
        return;
      }
      let installStatus;
      let updateMethod;
      if (installationType === "npm-local") {
        logForDebugging("AutoUpdater: Using local update method");
        updateMethod = "local";
        installStatus = await installOrUpdateClaudePackage(channel);
      } else if (installationType === "npm-global") {
        logForDebugging("AutoUpdater: Using global update method");
        updateMethod = "global";
        installStatus = await installGlobalPackage();
      } else if (installationType === "native") {
        logForDebugging("AutoUpdater: Unexpected native installation in non-native updater");
        onChangeIsUpdating(false);
        return;
      } else {
        logForDebugging(`AutoUpdater: Unknown installation type, falling back to config`);
        const isMigrated = config.installMethod === "local";
        updateMethod = isMigrated ? "local" : "global";
        if (isMigrated) {
          installStatus = await installOrUpdateClaudePackage(channel);
        } else {
          installStatus = await installGlobalPackage();
        }
      }
      onChangeIsUpdating(false);
      if (installStatus === "success") {
        logEvent("tengu_auto_updater_success", {
          fromVersion: currentVersion,
          toVersion: latestVersion,
          durationMs: Date.now() - startTime,
          wasMigrated: updateMethod === "local",
          installationType
        });
      } else {
        logEvent("tengu_auto_updater_fail", {
          fromVersion: currentVersion,
          attemptedVersion: latestVersion,
          status: installStatus,
          durationMs: Date.now() - startTime,
          wasMigrated: updateMethod === "local",
          installationType
        });
      }
      onAutoUpdaterResult({
        version: latestVersion,
        status: installStatus
      });
    }
  }, [onAutoUpdaterResult]);
  useEffect(() => {
    void checkForUpdates();
  }, [checkForUpdates]);
  useInterval(checkForUpdates, 30 * 60 * 1e3);
  if (!autoUpdaterResult?.version && (!versions.global || !versions.latest)) {
    return null;
  }
  if (!autoUpdaterResult?.version && !isUpdating) {
    return null;
  }
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, children: [
    verbose && /* @__PURE__ */ jsxs(Text, { dimColor: true, wrap: "truncate", children: [
      "globalVersion: ",
      versions.global,
      " \xB7 latestVersion:",
      " ",
      versions.latest
    ] }),
    isUpdating ? /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { color: "text", dimColor: true, wrap: "truncate", children: "Auto-updating\u2026" }) }) }) : autoUpdaterResult?.status === "success" && showSuccessMessage && updateSemver && /* @__PURE__ */ jsx(Text, { color: "success", wrap: "truncate", children: "\u2713 Update installed \xB7 Restart to apply" }),
    (autoUpdaterResult?.status === "install_failed" || autoUpdaterResult?.status === "no_permissions") && /* @__PURE__ */ jsxs(Text, { color: "error", wrap: "truncate", children: [
      "\u2717 Auto-update failed \xB7 Try ",
      /* @__PURE__ */ jsx(Text, { bold: true, children: "claude doctor" }),
      " or",
      " ",
      /* @__PURE__ */ jsx(Text, { bold: true, children: hasLocalInstall ? `cd ~/.claude/local && npm update ${"claude-code-reconstructed"}` : `npm i -g ${"claude-code-reconstructed"}` })
    ] })
  ] });
}
export {
  AutoUpdater
};
