import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import * as React from "react";
import { useState } from "react";
import { useInterval } from "usehooks-ts";
import { Text } from "../ink.js";
import { getLatestVersionFromGcs, getMaxVersion, shouldSkipVersion } from "../utils/autoUpdater.js";
import { isAutoUpdaterDisabled } from "../utils/config.js";
import { logForDebugging } from "../utils/debug.js";
import { getPackageManager } from "../utils/nativeInstaller/packageManagers.js";
import { gt, gte } from "../utils/semver.js";
import { getInitialSettings } from "../utils/settings/settings.js";
function PackageManagerAutoUpdater(t0) {
  const $ = _c(10);
  const {
    verbose
  } = t0;
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [packageManager, setPackageManager] = useState("unknown");
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = async () => {
      if (isAutoUpdaterDisabled()) {
        return;
      }
      const [channel, pm] = await Promise.all([Promise.resolve(getInitialSettings()?.autoUpdatesChannel ?? "latest"), getPackageManager()]);
      setPackageManager(pm);
      let latest = await getLatestVersionFromGcs(channel);
      const maxVersion = await getMaxVersion();
      if (maxVersion && latest && gt(latest, maxVersion)) {
        logForDebugging(`PackageManagerAutoUpdater: maxVersion ${maxVersion} is set, capping update from ${latest} to ${maxVersion}`);
        if (gte("0.0.0-dev", maxVersion)) {
          logForDebugging(`PackageManagerAutoUpdater: current version ${"0.0.0-dev"} is already at or above maxVersion ${maxVersion}, skipping update`);
          setUpdateAvailable(false);
          return;
        }
        latest = maxVersion;
      }
      const hasUpdate = latest && !gte("0.0.0-dev", latest) && !shouldSkipVersion(latest);
      setUpdateAvailable(!!hasUpdate);
      if (hasUpdate) {
        logForDebugging(`PackageManagerAutoUpdater: Update available ${"0.0.0-dev"} -> ${latest}`);
      }
    };
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const checkForUpdates = t1;
  let t2;
  let t3;
  if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = () => {
      checkForUpdates();
    };
    t3 = [checkForUpdates];
    $[1] = t2;
    $[2] = t3;
  } else {
    t2 = $[1];
    t3 = $[2];
  }
  React.useEffect(t2, t3);
  useInterval(checkForUpdates, 18e5);
  if (!updateAvailable) {
    return null;
  }
  const updateCommand = packageManager === "homebrew" ? "brew upgrade claude-code" : packageManager === "winget" ? "winget upgrade Anthropic.ClaudeCode" : packageManager === "apk" ? "apk upgrade claude-code" : "your package manager update command";
  let t4;
  if ($[3] !== verbose) {
    t4 = verbose && /* @__PURE__ */ jsxs(Text, { dimColor: true, wrap: "truncate", children: [
      "currentVersion: ",
      "0.0.0-dev"
    ] });
    $[3] = verbose;
    $[4] = t4;
  } else {
    t4 = $[4];
  }
  let t5;
  if ($[5] !== updateCommand) {
    t5 = /* @__PURE__ */ jsxs(Text, { color: "warning", wrap: "truncate", children: [
      "Update available! Run: ",
      /* @__PURE__ */ jsx(Text, { bold: true, children: updateCommand })
    ] });
    $[5] = updateCommand;
    $[6] = t5;
  } else {
    t5 = $[6];
  }
  let t6;
  if ($[7] !== t4 || $[8] !== t5) {
    t6 = /* @__PURE__ */ jsxs(Fragment, { children: [
      t4,
      t5
    ] });
    $[7] = t4;
    $[8] = t5;
    $[9] = t6;
  } else {
    t6 = $[9];
  }
  return t6;
}
export {
  PackageManagerAutoUpdater
};
