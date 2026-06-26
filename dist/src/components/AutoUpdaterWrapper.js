import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
const feature = (_name) => false;
import * as React from "react";
import "../utils/config.js";
import { logForDebugging } from "../utils/debug.js";
import { getCurrentInstallationType } from "../utils/doctorDiagnostic.js";
import { AutoUpdater } from "./AutoUpdater.js";
import { NativeAutoUpdater } from "./NativeAutoUpdater.js";
import { PackageManagerAutoUpdater } from "./PackageManagerAutoUpdater.js";
function AutoUpdaterWrapper(t0) {
  const $ = _c(17);
  const {
    isUpdating,
    onChangeIsUpdating,
    onAutoUpdaterResult,
    autoUpdaterResult,
    showSuccessMessage,
    verbose
  } = t0;
  const [useNativeInstaller, setUseNativeInstaller] = React.useState(null);
  const [isPackageManager, setIsPackageManager] = React.useState(null);
  let t1;
  let t2;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => {
      const checkInstallation = async function checkInstallation2() {
        if (false) {
          logForDebugging("AutoUpdaterWrapper: Skipping detection, auto-updates disabled");
          return;
        }
        const installationType = await getCurrentInstallationType();
        logForDebugging(`AutoUpdaterWrapper: Installation type: ${installationType}`);
        setUseNativeInstaller(installationType === "native");
        setIsPackageManager(installationType === "package-manager");
      };
      checkInstallation();
    };
    t2 = [];
    $[0] = t1;
    $[1] = t2;
  } else {
    t1 = $[0];
    t2 = $[1];
  }
  React.useEffect(t1, t2);
  if (useNativeInstaller === null || isPackageManager === null) {
    return null;
  }
  if (isPackageManager) {
    let t32;
    if ($[2] !== autoUpdaterResult || $[3] !== isUpdating || $[4] !== onAutoUpdaterResult || $[5] !== onChangeIsUpdating || $[6] !== showSuccessMessage || $[7] !== verbose) {
      t32 = /* @__PURE__ */ jsx(PackageManagerAutoUpdater, { verbose, onAutoUpdaterResult, autoUpdaterResult, isUpdating, onChangeIsUpdating, showSuccessMessage });
      $[2] = autoUpdaterResult;
      $[3] = isUpdating;
      $[4] = onAutoUpdaterResult;
      $[5] = onChangeIsUpdating;
      $[6] = showSuccessMessage;
      $[7] = verbose;
      $[8] = t32;
    } else {
      t32 = $[8];
    }
    return t32;
  }
  const Updater = useNativeInstaller ? NativeAutoUpdater : AutoUpdater;
  let t3;
  if ($[9] !== Updater || $[10] !== autoUpdaterResult || $[11] !== isUpdating || $[12] !== onAutoUpdaterResult || $[13] !== onChangeIsUpdating || $[14] !== showSuccessMessage || $[15] !== verbose) {
    t3 = /* @__PURE__ */ jsx(Updater, { verbose, onAutoUpdaterResult, autoUpdaterResult, isUpdating, onChangeIsUpdating, showSuccessMessage });
    $[9] = Updater;
    $[10] = autoUpdaterResult;
    $[11] = isUpdating;
    $[12] = onAutoUpdaterResult;
    $[13] = onChangeIsUpdating;
    $[14] = showSuccessMessage;
    $[15] = verbose;
    $[16] = t3;
  } else {
    t3 = $[16];
  }
  return t3;
}
export {
  AutoUpdaterWrapper
};
