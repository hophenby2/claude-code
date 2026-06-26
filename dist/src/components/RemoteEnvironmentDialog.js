import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import chalk from "chalk";
import figures from "figures";
import { useEffect, useState } from "react";
import { Text } from "../ink.js";
import { useKeybinding } from "../keybindings/useKeybinding.js";
import { toError } from "../utils/errors.js";
import { logError } from "../utils/log.js";
import { getSettingSourceName } from "../utils/settings/constants.js";
import { updateSettingsForSource } from "../utils/settings/settings.js";
import { getEnvironmentSelectionInfo } from "../utils/teleport/environmentSelection.js";
import { ConfigurableShortcutHint } from "./ConfigurableShortcutHint.js";
import { Select } from "./CustomSelect/select.js";
import { Byline } from "./design-system/Byline.js";
import { Dialog } from "./design-system/Dialog.js";
import { KeyboardShortcutHint } from "./design-system/KeyboardShortcutHint.js";
import { LoadingState } from "./design-system/LoadingState.js";
const DIALOG_TITLE = "Select Remote Environment";
const SETUP_HINT = `Configure environments at: https://claude.ai/code`;
function RemoteEnvironmentDialog(t0) {
  const $ = _c(27);
  const {
    onDone
  } = t0;
  const [loadingState, setLoadingState] = useState("loading");
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = [];
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const [environments, setEnvironments] = useState(t1);
  const [selectedEnvironment, setSelectedEnvironment] = useState(null);
  const [selectedEnvironmentSource, setSelectedEnvironmentSource] = useState(null);
  const [error, setError] = useState(null);
  let t2;
  let t3;
  if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = () => {
      let cancelled = false;
      const fetchInfo = async function fetchInfo2() {
        ;
        try {
          const result = await getEnvironmentSelectionInfo();
          if (cancelled) {
            return;
          }
          setEnvironments(result.availableEnvironments);
          setSelectedEnvironment(result.selectedEnvironment);
          setSelectedEnvironmentSource(result.selectedEnvironmentSource);
          setLoadingState(null);
        } catch (t42) {
          const err = t42;
          if (cancelled) {
            return;
          }
          const fetchError = toError(err);
          logError(fetchError);
          setError(fetchError.message);
          setLoadingState(null);
        }
      };
      fetchInfo();
      return () => {
        cancelled = true;
      };
    };
    t3 = [];
    $[1] = t2;
    $[2] = t3;
  } else {
    t2 = $[1];
    t3 = $[2];
  }
  useEffect(t2, t3);
  let t4;
  if ($[3] !== environments || $[4] !== onDone) {
    t4 = function handleSelect2(value) {
      if (value === "cancel") {
        onDone();
        return;
      }
      setLoadingState("updating");
      const selectedEnv = environments.find((env) => env.environment_id === value);
      if (!selectedEnv) {
        onDone("Error: Selected environment not found");
        return;
      }
      updateSettingsForSource("localSettings", {
        remote: {
          defaultEnvironmentId: selectedEnv.environment_id
        }
      });
      onDone(`Set default remote environment to ${chalk.bold(selectedEnv.name)} (${selectedEnv.environment_id})`);
    };
    $[3] = environments;
    $[4] = onDone;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  const handleSelect = t4;
  if (loadingState === "loading") {
    let t52;
    if ($[6] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t52 = /* @__PURE__ */ jsx(LoadingState, { message: "Loading environments\u2026" });
      $[6] = t52;
    } else {
      t52 = $[6];
    }
    let t6;
    if ($[7] !== onDone) {
      t6 = /* @__PURE__ */ jsx(Dialog, { title: DIALOG_TITLE, onCancel: onDone, hideInputGuide: true, children: t52 });
      $[7] = onDone;
      $[8] = t6;
    } else {
      t6 = $[8];
    }
    return t6;
  }
  if (error) {
    let t52;
    if ($[9] !== error) {
      t52 = /* @__PURE__ */ jsxs(Text, { color: "error", children: [
        "Error: ",
        error
      ] });
      $[9] = error;
      $[10] = t52;
    } else {
      t52 = $[10];
    }
    let t6;
    if ($[11] !== onDone || $[12] !== t52) {
      t6 = /* @__PURE__ */ jsx(Dialog, { title: DIALOG_TITLE, onCancel: onDone, children: t52 });
      $[11] = onDone;
      $[12] = t52;
      $[13] = t6;
    } else {
      t6 = $[13];
    }
    return t6;
  }
  if (!selectedEnvironment) {
    let t52;
    if ($[14] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t52 = /* @__PURE__ */ jsx(Text, { children: "No remote environments available." });
      $[14] = t52;
    } else {
      t52 = $[14];
    }
    let t6;
    if ($[15] !== onDone) {
      t6 = /* @__PURE__ */ jsx(Dialog, { title: DIALOG_TITLE, subtitle: SETUP_HINT, onCancel: onDone, children: t52 });
      $[15] = onDone;
      $[16] = t6;
    } else {
      t6 = $[16];
    }
    return t6;
  }
  if (environments.length === 1) {
    let t52;
    if ($[17] !== onDone || $[18] !== selectedEnvironment) {
      t52 = /* @__PURE__ */ jsx(SingleEnvironmentContent, { environment: selectedEnvironment, onDone });
      $[17] = onDone;
      $[18] = selectedEnvironment;
      $[19] = t52;
    } else {
      t52 = $[19];
    }
    return t52;
  }
  let t5;
  if ($[20] !== environments || $[21] !== handleSelect || $[22] !== loadingState || $[23] !== onDone || $[24] !== selectedEnvironment || $[25] !== selectedEnvironmentSource) {
    t5 = /* @__PURE__ */ jsx(MultipleEnvironmentsContent, { environments, selectedEnvironment, selectedEnvironmentSource, loadingState, onSelect: handleSelect, onCancel: onDone });
    $[20] = environments;
    $[21] = handleSelect;
    $[22] = loadingState;
    $[23] = onDone;
    $[24] = selectedEnvironment;
    $[25] = selectedEnvironmentSource;
    $[26] = t5;
  } else {
    t5 = $[26];
  }
  return t5;
}
function EnvironmentLabel(t0) {
  const $ = _c(7);
  const {
    environment
  } = t0;
  let t1;
  if ($[0] !== environment.name) {
    t1 = /* @__PURE__ */ jsx(Text, { bold: true, children: environment.name });
    $[0] = environment.name;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== environment.environment_id) {
    t2 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "(",
      environment.environment_id,
      ")"
    ] });
    $[2] = environment.environment_id;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== t1 || $[5] !== t2) {
    t3 = /* @__PURE__ */ jsxs(Text, { children: [
      figures.tick,
      " Using ",
      t1,
      " ",
      t2
    ] });
    $[4] = t1;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}
function SingleEnvironmentContent(t0) {
  const $ = _c(6);
  const {
    environment,
    onDone
  } = t0;
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = {
      context: "Confirmation"
    };
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  useKeybinding("confirm:yes", onDone, t1);
  let t2;
  if ($[1] !== environment) {
    t2 = /* @__PURE__ */ jsx(EnvironmentLabel, { environment });
    $[1] = environment;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== onDone || $[4] !== t2) {
    t3 = /* @__PURE__ */ jsx(Dialog, { title: DIALOG_TITLE, subtitle: SETUP_HINT, onCancel: onDone, children: t2 });
    $[3] = onDone;
    $[4] = t2;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  return t3;
}
function MultipleEnvironmentsContent(t0) {
  const $ = _c(18);
  const {
    environments,
    selectedEnvironment,
    selectedEnvironmentSource,
    loadingState,
    onSelect,
    onCancel
  } = t0;
  let t1;
  if ($[0] !== selectedEnvironmentSource) {
    t1 = selectedEnvironmentSource && selectedEnvironmentSource !== "localSettings" ? ` (from ${getSettingSourceName(selectedEnvironmentSource)} settings)` : "";
    $[0] = selectedEnvironmentSource;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const sourceSuffix = t1;
  let t2;
  if ($[2] !== selectedEnvironment.name) {
    t2 = /* @__PURE__ */ jsx(Text, { bold: true, children: selectedEnvironment.name });
    $[2] = selectedEnvironment.name;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== sourceSuffix || $[5] !== t2) {
    t3 = /* @__PURE__ */ jsxs(Text, { children: [
      "Currently using: ",
      t2,
      sourceSuffix
    ] });
    $[4] = sourceSuffix;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  const subtitle = t3;
  let t4;
  if ($[7] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t4 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: SETUP_HINT });
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  let t5;
  if ($[8] !== environments || $[9] !== loadingState || $[10] !== onSelect || $[11] !== selectedEnvironment.environment_id) {
    t5 = loadingState === "updating" ? /* @__PURE__ */ jsx(LoadingState, { message: "Updating\u2026" }) : /* @__PURE__ */ jsx(Select, { options: environments.map(_temp), defaultValue: selectedEnvironment.environment_id, onChange: onSelect, onCancel: () => onSelect("cancel"), layout: "compact-vertical" });
    $[8] = environments;
    $[9] = loadingState;
    $[10] = onSelect;
    $[11] = selectedEnvironment.environment_id;
    $[12] = t5;
  } else {
    t5 = $[12];
  }
  let t6;
  if ($[13] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t6 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: "select" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "cancel" })
    ] }) });
    $[13] = t6;
  } else {
    t6 = $[13];
  }
  let t7;
  if ($[14] !== onCancel || $[15] !== subtitle || $[16] !== t5) {
    t7 = /* @__PURE__ */ jsxs(Dialog, { title: DIALOG_TITLE, subtitle, onCancel, hideInputGuide: true, children: [
      t4,
      t5,
      t6
    ] });
    $[14] = onCancel;
    $[15] = subtitle;
    $[16] = t5;
    $[17] = t7;
  } else {
    t7 = $[17];
  }
  return t7;
}
function _temp(env) {
  return {
    label: /* @__PURE__ */ jsxs(Text, { children: [
      env.name,
      " ",
      /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "(",
        env.environment_id,
        ")"
      ] })
    ] }),
    value: env.environment_id
  };
}
export {
  RemoteEnvironmentDialog
};
