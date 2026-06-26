import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box, render, Text } from "../ink.js";
import { KeybindingSetup } from "../keybindings/KeybindingProviderSetup.js";
import { AppStateProvider } from "../state/AppState.js";
import { getBaseRenderOptions } from "../utils/renderOptions.js";
import { jsonStringify, writeFileSync_DEPRECATED } from "../utils/slowOperations.js";
import { Select } from "./CustomSelect/index.js";
import { Dialog } from "./design-system/Dialog.js";
function InvalidConfigDialog(t0) {
  const $ = _c(19);
  const {
    filePath,
    errorDescription,
    onExit,
    onReset
  } = t0;
  let t1;
  if ($[0] !== onExit || $[1] !== onReset) {
    t1 = (value) => {
      if (value === "exit") {
        onExit();
      } else {
        onReset();
      }
    };
    $[0] = onExit;
    $[1] = onReset;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  const handleSelect = t1;
  let t2;
  if ($[3] !== filePath) {
    t2 = /* @__PURE__ */ jsxs(Text, { children: [
      "The configuration file at ",
      /* @__PURE__ */ jsx(Text, { bold: true, children: filePath }),
      " contains invalid JSON."
    ] });
    $[3] = filePath;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  let t3;
  if ($[5] !== errorDescription) {
    t3 = /* @__PURE__ */ jsx(Text, { children: errorDescription });
    $[5] = errorDescription;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] !== t2 || $[8] !== t3) {
    t4 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
      t2,
      t3
    ] });
    $[7] = t2;
    $[8] = t3;
    $[9] = t4;
  } else {
    t4 = $[9];
  }
  let t5;
  if ($[10] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t5 = /* @__PURE__ */ jsx(Text, { bold: true, children: "Choose an option:" });
    $[10] = t5;
  } else {
    t5 = $[10];
  }
  let t6;
  if ($[11] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t6 = [{
      label: "Exit and fix manually",
      value: "exit"
    }, {
      label: "Reset with default configuration",
      value: "reset"
    }];
    $[11] = t6;
  } else {
    t6 = $[11];
  }
  let t7;
  if ($[12] !== handleSelect || $[13] !== onExit) {
    t7 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t5,
      /* @__PURE__ */ jsx(Select, { options: t6, onChange: handleSelect, onCancel: onExit })
    ] });
    $[12] = handleSelect;
    $[13] = onExit;
    $[14] = t7;
  } else {
    t7 = $[14];
  }
  let t8;
  if ($[15] !== onExit || $[16] !== t4 || $[17] !== t7) {
    t8 = /* @__PURE__ */ jsxs(Dialog, { title: "Configuration Error", color: "error", onCancel: onExit, children: [
      t4,
      t7
    ] });
    $[15] = onExit;
    $[16] = t4;
    $[17] = t7;
    $[18] = t8;
  } else {
    t8 = $[18];
  }
  return t8;
}
const SAFE_ERROR_THEME_NAME = "dark";
async function showInvalidConfigDialog({
  error
}) {
  const renderOptions = {
    ...getBaseRenderOptions(false),
    // IMPORTANT: Use hardcoded theme name to avoid circular dependency with getGlobalConfig()
    // This allows the error dialog to show even when config file has JSON syntax errors
    theme: SAFE_ERROR_THEME_NAME
  };
  await new Promise(async (resolve) => {
    const {
      unmount
    } = await render(/* @__PURE__ */ jsx(AppStateProvider, { children: /* @__PURE__ */ jsx(KeybindingSetup, { children: /* @__PURE__ */ jsx(InvalidConfigDialog, { filePath: error.filePath, errorDescription: error.message, onExit: () => {
      unmount();
      void resolve();
      process.exit(1);
    }, onReset: () => {
      writeFileSync_DEPRECATED(error.filePath, jsonStringify(error.defaultConfig, null, 2), {
        flush: false,
        encoding: "utf8"
      });
      unmount();
      void resolve();
      process.exit(0);
    } }) }) }), renderOptions);
  });
}
export {
  showInvalidConfigDialog
};
