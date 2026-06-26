import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box, Text } from "../../ink.js";
import { getHookDisplayText, hookSourceHeaderDisplayString } from "../../utils/hooks/hooksSettings.js";
import { Select } from "../CustomSelect/select.js";
import { Dialog } from "../design-system/Dialog.js";
function SelectHookMode(t0) {
  const $ = _c(19);
  const {
    selectedEvent,
    selectedMatcher,
    hooksForSelectedMatcher,
    hookEventMetadata,
    onSelect,
    onCancel
  } = t0;
  const title = hookEventMetadata.matcherMetadata !== void 0 ? `${selectedEvent} - Matcher: ${selectedMatcher || "(all)"}` : selectedEvent;
  if (hooksForSelectedMatcher.length === 0) {
    let t12;
    if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "No hooks configured for this event." }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "To add hooks, edit settings.json directly or ask Claude." })
      ] });
      $[0] = t12;
    } else {
      t12 = $[0];
    }
    let t22;
    if ($[1] !== hookEventMetadata.description || $[2] !== onCancel || $[3] !== title) {
      t22 = /* @__PURE__ */ jsx(Dialog, { title, subtitle: hookEventMetadata.description, onCancel, inputGuide: _temp, children: t12 });
      $[1] = hookEventMetadata.description;
      $[2] = onCancel;
      $[3] = title;
      $[4] = t22;
    } else {
      t22 = $[4];
    }
    return t22;
  }
  const t1 = hookEventMetadata.description;
  let t2;
  if ($[5] !== hooksForSelectedMatcher) {
    t2 = hooksForSelectedMatcher.map(_temp2);
    $[5] = hooksForSelectedMatcher;
    $[6] = t2;
  } else {
    t2 = $[6];
  }
  let t3;
  if ($[7] !== hooksForSelectedMatcher || $[8] !== onSelect) {
    t3 = (value) => {
      const index_0 = parseInt(value, 10);
      const hook_0 = hooksForSelectedMatcher[index_0];
      if (hook_0) {
        onSelect(hook_0);
      }
    };
    $[7] = hooksForSelectedMatcher;
    $[8] = onSelect;
    $[9] = t3;
  } else {
    t3 = $[9];
  }
  let t4;
  if ($[10] !== onCancel || $[11] !== t2 || $[12] !== t3) {
    t4 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: /* @__PURE__ */ jsx(Select, { options: t2, onChange: t3, onCancel }) });
    $[10] = onCancel;
    $[11] = t2;
    $[12] = t3;
    $[13] = t4;
  } else {
    t4 = $[13];
  }
  let t5;
  if ($[14] !== hookEventMetadata.description || $[15] !== onCancel || $[16] !== t4 || $[17] !== title) {
    t5 = /* @__PURE__ */ jsx(Dialog, { title, subtitle: t1, onCancel, children: t4 });
    $[14] = hookEventMetadata.description;
    $[15] = onCancel;
    $[16] = t4;
    $[17] = title;
    $[18] = t5;
  } else {
    t5 = $[18];
  }
  return t5;
}
function _temp2(hook, index) {
  return {
    label: `[${hook.config.type}] ${getHookDisplayText(hook.config)}`,
    value: index.toString(),
    description: hook.source === "pluginHook" && hook.pluginName ? `${hookSourceHeaderDisplayString(hook.source)} (${hook.pluginName})` : hookSourceHeaderDisplayString(hook.source)
  };
}
function _temp() {
  return /* @__PURE__ */ jsx(Text, { children: "Esc to go back" });
}
export {
  SelectHookMode
};
