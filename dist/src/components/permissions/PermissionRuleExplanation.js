import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
const feature = (_name) => false;
import chalk from "chalk";
import { Ansi, Box, Text } from "../../ink.js";
import { useAppState } from "../../state/AppState.js";
import { permissionRuleValueToString } from "../../utils/permissions/permissionRuleParser.js";
import ThemedText from "../design-system/ThemedText.js";
function stringsForDecisionReason(reason, toolType) {
  if (!reason) {
    return null;
  }
  if (false) {
    if (reason.classifier === "auto-mode") {
      return {
        reasonString: `Auto mode classifier requires confirmation for this ${toolType}.
${reason.reason}`,
        configString: void 0,
        themeColor: "error"
      };
    }
    return {
      reasonString: `Classifier ${chalk.bold(reason.classifier)} requires confirmation for this ${toolType}.
${reason.reason}`,
      configString: void 0
    };
  }
  switch (reason.type) {
    case "rule":
      return {
        reasonString: `Permission rule ${chalk.bold(permissionRuleValueToString(reason.rule.ruleValue))} requires confirmation for this ${toolType}.`,
        configString: reason.rule.source === "policySettings" ? void 0 : "/permissions to update rules"
      };
    case "hook": {
      const hookReasonString = reason.reason ? `:
${reason.reason}` : ".";
      const sourceLabel = reason.hookSource ? ` ${chalk.dim(`[${reason.hookSource}]`)}` : "";
      return {
        reasonString: `Hook ${chalk.bold(reason.hookName)} requires confirmation for this ${toolType}${hookReasonString}${sourceLabel}`,
        configString: "/hooks to update"
      };
    }
    case "safetyCheck":
    case "other":
      return {
        reasonString: reason.reason,
        configString: void 0
      };
    case "workingDir":
      return {
        reasonString: reason.reason,
        configString: "/permissions to update rules"
      };
    default:
      return null;
  }
}
function PermissionRuleExplanation(t0) {
  const $ = _c(11);
  const {
    permissionResult,
    toolType
  } = t0;
  const permissionMode = useAppState(_temp);
  const t1 = permissionResult?.decisionReason;
  let t2;
  if ($[0] !== t1 || $[1] !== toolType) {
    t2 = stringsForDecisionReason(t1, toolType);
    $[0] = t1;
    $[1] = toolType;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  const strings = t2;
  if (!strings) {
    return null;
  }
  const themeColor = strings.themeColor ?? (permissionResult?.decisionReason?.type === "hook" && permissionMode === "auto" ? "warning" : void 0);
  let t3;
  if ($[3] !== strings.reasonString || $[4] !== themeColor) {
    t3 = themeColor ? /* @__PURE__ */ jsx(ThemedText, { color: themeColor, children: strings.reasonString }) : /* @__PURE__ */ jsx(Text, { children: /* @__PURE__ */ jsx(Ansi, { children: strings.reasonString }) });
    $[3] = strings.reasonString;
    $[4] = themeColor;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  let t4;
  if ($[6] !== strings.configString) {
    t4 = strings.configString && /* @__PURE__ */ jsx(Text, { dimColor: true, children: strings.configString });
    $[6] = strings.configString;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  let t5;
  if ($[8] !== t3 || $[9] !== t4) {
    t5 = /* @__PURE__ */ jsxs(Box, { marginBottom: 1, flexDirection: "column", children: [
      t3,
      t4
    ] });
    $[8] = t3;
    $[9] = t4;
    $[10] = t5;
  } else {
    t5 = $[10];
  }
  return t5;
}
function _temp(s) {
  return s.toolPermissionContext.mode;
}
export {
  PermissionRuleExplanation
};
