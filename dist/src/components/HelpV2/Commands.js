import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { formatDescriptionWithSource } from "../../commands.js";
import { Box, Text } from "../../ink.js";
import { truncate } from "../../utils/format.js";
import { Select } from "../CustomSelect/select.js";
import { useTabHeaderFocus } from "../design-system/Tabs.js";
function Commands(t0) {
  const $ = _c(14);
  const {
    commands,
    maxHeight,
    columns,
    title,
    onCancel,
    emptyMessage
  } = t0;
  const {
    headerFocused,
    focusHeader
  } = useTabHeaderFocus();
  const maxWidth = Math.max(1, columns - 10);
  const visibleCount = Math.max(1, Math.floor((maxHeight - 10) / 2));
  let t1;
  if ($[0] !== commands || $[1] !== maxWidth) {
    const seen = /* @__PURE__ */ new Set();
    let t22;
    if ($[3] !== maxWidth) {
      t22 = (cmd_0) => ({
        label: `/${cmd_0.name}`,
        value: cmd_0.name,
        description: truncate(formatDescriptionWithSource(cmd_0), maxWidth, true)
      });
      $[3] = maxWidth;
      $[4] = t22;
    } else {
      t22 = $[4];
    }
    t1 = commands.filter((cmd) => {
      if (seen.has(cmd.name)) {
        return false;
      }
      seen.add(cmd.name);
      return true;
    }).sort(_temp).map(t22);
    $[0] = commands;
    $[1] = maxWidth;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  const options = t1;
  let t2;
  if ($[5] !== commands.length || $[6] !== emptyMessage || $[7] !== focusHeader || $[8] !== headerFocused || $[9] !== onCancel || $[10] !== options || $[11] !== title || $[12] !== visibleCount) {
    t2 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", paddingY: 1, children: commands.length === 0 && emptyMessage ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: emptyMessage }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Text, { children: title }),
      /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Select, { options, visibleOptionCount: visibleCount, onCancel, disableSelection: true, hideIndexes: true, layout: "compact-vertical", onUpFromFirstItem: focusHeader, isDisabled: headerFocused }) })
    ] }) });
    $[5] = commands.length;
    $[6] = emptyMessage;
    $[7] = focusHeader;
    $[8] = headerFocused;
    $[9] = onCancel;
    $[10] = options;
    $[11] = title;
    $[12] = visibleCount;
    $[13] = t2;
  } else {
    t2 = $[13];
  }
  return t2;
}
function _temp(a, b) {
  return a.name.localeCompare(b.name);
}
export {
  Commands
};
