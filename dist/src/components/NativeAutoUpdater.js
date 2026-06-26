import { jsx, jsxs } from "react/jsx-runtime";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { logEvent } from "../services/analytics/index.js";
import "../utils/debug.js";
import { logError } from "../utils/log.js";
import { useInterval } from "usehooks-ts";
import { useUpdateNotification } from "../hooks/useUpdateNotification.js";
import { Box, Text } from "../ink.js";
import { getMaxVersion, getMaxVersionMessage } from "../utils/autoUpdater.js";
import { isAutoUpdaterDisabled } from "../utils/config.js";
import { installLatest } from "../utils/nativeInstaller/index.js";
import { gt } from "../utils/semver.js";
import { getInitialSettings } from "../utils/settings/settings.js";
function getErrorType(errorMessage) {
  if (errorMessage.includes("timeout")) {
    return "timeout";
  }
  if (errorMessage.includes("Checksum mismatch")) {
    return "checksum_mismatch";
  }
  if (errorMessage.includes("ENOENT") || errorMessage.includes("not found")) {
    return "not_found";
  }
  if (errorMessage.includes("EACCES") || errorMessage.includes("permission")) {
    return "permission_denied";
  }
  if (errorMessage.includes("ENOSPC")) {
    return "disk_full";
  }
  if (errorMessage.includes("npm")) {
    return "npm_error";
  }
  if (errorMessage.includes("network") || errorMessage.includes("ECONNREFUSED") || errorMessage.includes("ENOTFOUND")) {
    return "network_error";
  }
  return "unknown";
}
function NativeAutoUpdater({
  isUpdating,
  onChangeIsUpdating,
  onAutoUpdaterResult,
  autoUpdaterResult,
  showSuccessMessage,
  verbose
}) {
  const [versions, setVersions] = useState({});
  const [maxVersionIssue, setMaxVersionIssue] = useState(null);
  const updateSemver = useUpdateNotification(autoUpdaterResult?.version);
  const channel = getInitialSettings()?.autoUpdatesChannel ?? "latest";
  const isUpdatingRef = useRef(isUpdating);
  isUpdatingRef.current = isUpdating;
  const checkForUpdates = React.useCallback(async () => {
    if (isUpdatingRef.current) {
      return;
    }
    if (false) {
      logForDebugging("NativeAutoUpdater: Skipping update check in test/dev environment");
      return;
    }
    if (isAutoUpdaterDisabled()) {
      return;
    }
    onChangeIsUpdating(true);
    const startTime = Date.now();
    logEvent("tengu_native_auto_updater_start", {});
    try {
      const maxVersion = await getMaxVersion();
      if (maxVersion && gt("0.0.0", maxVersion)) {
        const msg = await getMaxVersionMessage();
        setMaxVersionIssue(msg ?? "affects your version");
      }
      const result = await installLatest(channel);
      const currentVersion = "0.0.0";
      const latencyMs = Date.now() - startTime;
      if (result.lockFailed) {
        logEvent("tengu_native_auto_updater_lock_contention", {
          latency_ms: latencyMs
        });
        return;
      }
      setVersions({
        current: currentVersion,
        latest: result.latestVersion
      });
      if (result.wasUpdated) {
        logEvent("tengu_native_auto_updater_success", {
          latency_ms: latencyMs
        });
        onAutoUpdaterResult({
          version: result.latestVersion,
          status: "success"
        });
      } else {
        logEvent("tengu_native_auto_updater_up_to_date", {
          latency_ms: latencyMs
        });
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(error);
      const errorType = getErrorType(errorMessage);
      logEvent("tengu_native_auto_updater_fail", {
        latency_ms: latencyMs,
        error_timeout: errorType === "timeout",
        error_checksum: errorType === "checksum_mismatch",
        error_not_found: errorType === "not_found",
        error_permission: errorType === "permission_denied",
        error_disk_full: errorType === "disk_full",
        error_npm: errorType === "npm_error",
        error_network: errorType === "network_error"
      });
      onAutoUpdaterResult({
        version: null,
        status: "install_failed"
      });
    } finally {
      onChangeIsUpdating(false);
    }
  }, [onAutoUpdaterResult, channel]);
  useEffect(() => {
    void checkForUpdates();
  }, [checkForUpdates]);
  useInterval(checkForUpdates, 30 * 60 * 1e3);
  const hasUpdateResult = !!autoUpdaterResult?.version;
  const hasVersionInfo = !!versions.current && !!versions.latest;
  const shouldRender = !!maxVersionIssue || hasUpdateResult || isUpdating && hasVersionInfo;
  if (!shouldRender) {
    return null;
  }
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, children: [
    verbose && /* @__PURE__ */ jsxs(Text, { dimColor: true, wrap: "truncate", children: [
      "current: ",
      versions.current,
      " \xB7 ",
      channel,
      ": ",
      versions.latest
    ] }),
    isUpdating ? /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, wrap: "truncate", children: "Checking for updates" }) }) : autoUpdaterResult?.status === "success" && showSuccessMessage && updateSemver && /* @__PURE__ */ jsx(Text, { color: "success", wrap: "truncate", children: "\u2713 Update installed \xB7 Restart to update" }),
    autoUpdaterResult?.status === "install_failed" && /* @__PURE__ */ jsxs(Text, { color: "error", wrap: "truncate", children: [
      "\u2717 Auto-update failed \xB7 Try ",
      /* @__PURE__ */ jsx(Text, { bold: true, children: "/status" })
    ] }),
    maxVersionIssue && false
  ] });
}
export {
  NativeAutoUpdater
};
