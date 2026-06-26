import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Text } from "../../../ink.js";
import { BashTool } from "../../../tools/BashTool/BashTool.js";
function PermissionRuleDescription(t0) {
  const $ = _c(9);
  const {
    ruleValue
  } = t0;
  switch (ruleValue.toolName) {
    case BashTool.name: {
      if (ruleValue.ruleContent) {
        if (ruleValue.ruleContent.endsWith(":*")) {
          let t1;
          if ($[0] !== ruleValue.ruleContent) {
            t1 = ruleValue.ruleContent.slice(0, -2);
            $[0] = ruleValue.ruleContent;
            $[1] = t1;
          } else {
            t1 = $[1];
          }
          let t2;
          if ($[2] !== t1) {
            t2 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
              "Any Bash command starting with",
              " ",
              /* @__PURE__ */ jsx(Text, { bold: true, children: t1 })
            ] });
            $[2] = t1;
            $[3] = t2;
          } else {
            t2 = $[3];
          }
          return t2;
        } else {
          let t1;
          if ($[4] !== ruleValue.ruleContent) {
            t1 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
              "The Bash command ",
              /* @__PURE__ */ jsx(Text, { bold: true, children: ruleValue.ruleContent })
            ] });
            $[4] = ruleValue.ruleContent;
            $[5] = t1;
          } else {
            t1 = $[5];
          }
          return t1;
        }
      } else {
        let t1;
        if ($[6] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
          t1 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Any Bash command" });
          $[6] = t1;
        } else {
          t1 = $[6];
        }
        return t1;
      }
    }
    default: {
      if (!ruleValue.ruleContent) {
        let t1;
        if ($[7] !== ruleValue.toolName) {
          t1 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
            "Any use of the ",
            /* @__PURE__ */ jsx(Text, { bold: true, children: ruleValue.toolName }),
            " tool"
          ] });
          $[7] = ruleValue.toolName;
          $[8] = t1;
        } else {
          t1 = $[8];
        }
        return t1;
      } else {
        return null;
      }
    }
  }
}
export {
  PermissionRuleDescription
};
