import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useEffect, useState } from "react";
import { Box, Text, useInput } from "../../../ink.js";
import { getAutoModeDenials } from "../../../utils/autoModeDenials.js";
import { Select } from "../../CustomSelect/select.js";
import { StatusIcon } from "../../design-system/StatusIcon.js";
import { useTabHeaderFocus } from "../../design-system/Tabs.js";
function RecentDenialsTab(t0) {
  const $ = _c(30);
  const {
    onHeaderFocusChange,
    onStateChange
  } = t0;
  const {
    headerFocused,
    focusHeader
  } = useTabHeaderFocus();
  let t1;
  let t2;
  if ($[0] !== headerFocused || $[1] !== onHeaderFocusChange) {
    t1 = () => {
      onHeaderFocusChange?.(headerFocused);
    };
    t2 = [headerFocused, onHeaderFocusChange];
    $[0] = headerFocused;
    $[1] = onHeaderFocusChange;
    $[2] = t1;
    $[3] = t2;
  } else {
    t1 = $[2];
    t2 = $[3];
  }
  useEffect(t1, t2);
  const [denials] = useState(_temp);
  const [approved, setApproved] = useState(_temp2);
  const [retry, setRetry] = useState(_temp3);
  const [focusedIdx, setFocusedIdx] = useState(0);
  let t3;
  let t4;
  if ($[4] !== approved || $[5] !== denials || $[6] !== onStateChange || $[7] !== retry) {
    t3 = () => {
      onStateChange({
        approved,
        retry,
        denials
      });
    };
    t4 = [approved, retry, denials, onStateChange];
    $[4] = approved;
    $[5] = denials;
    $[6] = onStateChange;
    $[7] = retry;
    $[8] = t3;
    $[9] = t4;
  } else {
    t3 = $[8];
    t4 = $[9];
  }
  useEffect(t3, t4);
  let t5;
  if ($[10] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t5 = (value) => {
      const idx = Number(value);
      setApproved((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) {
          next.delete(idx);
        } else {
          next.add(idx);
        }
        return next;
      });
    };
    $[10] = t5;
  } else {
    t5 = $[10];
  }
  const handleSelect = t5;
  let t6;
  if ($[11] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t6 = (value_0) => {
      setFocusedIdx(Number(value_0));
    };
    $[11] = t6;
  } else {
    t6 = $[11];
  }
  const handleFocus = t6;
  let t7;
  if ($[12] !== focusedIdx) {
    t7 = (input, _key) => {
      if (input === "r") {
        setRetry((prev_0) => {
          const next_0 = new Set(prev_0);
          if (next_0.has(focusedIdx)) {
            next_0.delete(focusedIdx);
          } else {
            next_0.add(focusedIdx);
          }
          return next_0;
        });
        setApproved((prev_1) => {
          if (prev_1.has(focusedIdx)) {
            return prev_1;
          }
          const next_1 = new Set(prev_1);
          next_1.add(focusedIdx);
          return next_1;
        });
      }
    };
    $[12] = focusedIdx;
    $[13] = t7;
  } else {
    t7 = $[13];
  }
  const t8 = denials.length > 0;
  let t9;
  if ($[14] !== t8) {
    t9 = {
      isActive: t8
    };
    $[14] = t8;
    $[15] = t9;
  } else {
    t9 = $[15];
  }
  useInput(t7, t9);
  if (denials.length === 0) {
    let t102;
    if ($[16] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t102 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: "No recent denials. Commands denied by the auto mode classifier will appear here." });
      $[16] = t102;
    } else {
      t102 = $[16];
    }
    return t102;
  }
  let t10;
  if ($[17] !== approved || $[18] !== denials || $[19] !== retry) {
    let t112;
    if ($[21] !== approved || $[22] !== retry) {
      t112 = (d, idx_0) => {
        const isApproved = approved.has(idx_0);
        const suffix = retry.has(idx_0) ? " (retry)" : "";
        return {
          label: /* @__PURE__ */ jsxs(Text, { children: [
            /* @__PURE__ */ jsx(StatusIcon, { status: isApproved ? "success" : "error", withSpace: true }),
            d.display,
            /* @__PURE__ */ jsx(Text, { dimColor: true, children: suffix })
          ] }),
          value: String(idx_0)
        };
      };
      $[21] = approved;
      $[22] = retry;
      $[23] = t112;
    } else {
      t112 = $[23];
    }
    t10 = denials.map(t112);
    $[17] = approved;
    $[18] = denials;
    $[19] = retry;
    $[20] = t10;
  } else {
    t10 = $[20];
  }
  const options = t10;
  let t11;
  if ($[24] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t11 = /* @__PURE__ */ jsx(Text, { children: "Commands recently denied by the auto mode classifier." });
    $[24] = t11;
  } else {
    t11 = $[24];
  }
  const t12 = Math.min(10, options.length);
  let t13;
  if ($[25] !== focusHeader || $[26] !== headerFocused || $[27] !== options || $[28] !== t12) {
    t13 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t11,
      /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Select, { options, onChange: handleSelect, onFocus: handleFocus, visibleOptionCount: t12, isDisabled: headerFocused, onUpFromFirstItem: focusHeader }) })
    ] });
    $[25] = focusHeader;
    $[26] = headerFocused;
    $[27] = options;
    $[28] = t12;
    $[29] = t13;
  } else {
    t13 = $[29];
  }
  return t13;
}
function _temp3() {
  return /* @__PURE__ */ new Set();
}
function _temp2() {
  return /* @__PURE__ */ new Set();
}
function _temp() {
  return getAutoModeDenials();
}
export {
  RecentDenialsTab
};
