import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box, Text } from "../ink.js";
import { gracefulShutdownSync } from "../utils/gracefulShutdown.js";
import { Select } from "./CustomSelect/index.js";
import { Dialog } from "./design-system/Dialog.js";
function DevChannelsDialog(t0) {
  const $ = _c(14);
  const {
    channels,
    onAccept
  } = t0;
  let t1;
  if ($[0] !== onAccept) {
    t1 = function onChange2(value) {
      bb2: switch (value) {
        case "accept": {
          onAccept();
          break bb2;
        }
        case "exit": {
          gracefulShutdownSync(1);
        }
      }
    };
    $[0] = onAccept;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const onChange = t1;
  const handleEscape = _temp;
  let t2;
  let t3;
  if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = /* @__PURE__ */ jsx(Text, { children: "--dangerously-load-development-channels is for local channel development only. Do not use this option to run channels you have downloaded off the internet." });
    t3 = /* @__PURE__ */ jsx(Text, { children: "Please use --channels to run a list of approved channels." });
    $[2] = t2;
    $[3] = t3;
  } else {
    t2 = $[2];
    t3 = $[3];
  }
  let t4;
  if ($[4] !== channels) {
    t4 = channels.map(_temp2).join(", ");
    $[4] = channels;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  let t5;
  if ($[6] !== t4) {
    t5 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
      t2,
      t3,
      /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Channels:",
        " ",
        t4
      ] })
    ] });
    $[6] = t4;
    $[7] = t5;
  } else {
    t5 = $[7];
  }
  let t6;
  if ($[8] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t6 = [{
      label: "I am using this for local development",
      value: "accept"
    }, {
      label: "Exit",
      value: "exit"
    }];
    $[8] = t6;
  } else {
    t6 = $[8];
  }
  let t7;
  if ($[9] !== onChange) {
    t7 = /* @__PURE__ */ jsx(Select, { options: t6, onChange: (value_0) => onChange(value_0) });
    $[9] = onChange;
    $[10] = t7;
  } else {
    t7 = $[10];
  }
  let t8;
  if ($[11] !== t5 || $[12] !== t7) {
    t8 = /* @__PURE__ */ jsxs(Dialog, { title: "WARNING: Loading development channels", color: "error", onCancel: handleEscape, children: [
      t5,
      t7
    ] });
    $[11] = t5;
    $[12] = t7;
    $[13] = t8;
  } else {
    t8 = $[13];
  }
  return t8;
}
function _temp2(c) {
  return c.kind === "plugin" ? `plugin:${c.name}@${c.marketplace}` : `server:${c.name}`;
}
function _temp() {
  gracefulShutdownSync(0);
}
export {
  DevChannelsDialog
};
