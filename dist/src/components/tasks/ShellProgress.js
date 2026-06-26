import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Text } from "../../ink.js";
function TaskStatusText(t0) {
  const $ = _c(4);
  const {
    status,
    label,
    suffix
  } = t0;
  const displayLabel = label ?? status;
  const color = status === "completed" ? "success" : status === "failed" ? "error" : status === "killed" ? "warning" : void 0;
  let t1;
  if ($[0] !== color || $[1] !== displayLabel || $[2] !== suffix) {
    t1 = /* @__PURE__ */ jsxs(Text, { color, dimColor: true, children: [
      "(",
      displayLabel,
      suffix,
      ")"
    ] });
    $[0] = color;
    $[1] = displayLabel;
    $[2] = suffix;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  return t1;
}
function ShellProgress(t0) {
  const $ = _c(4);
  const {
    shell
  } = t0;
  switch (shell.status) {
    case "completed": {
      let t1;
      if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t1 = /* @__PURE__ */ jsx(TaskStatusText, { status: "completed", label: "done" });
        $[0] = t1;
      } else {
        t1 = $[0];
      }
      return t1;
    }
    case "failed": {
      let t1;
      if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t1 = /* @__PURE__ */ jsx(TaskStatusText, { status: "failed", label: "error" });
        $[1] = t1;
      } else {
        t1 = $[1];
      }
      return t1;
    }
    case "killed": {
      let t1;
      if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t1 = /* @__PURE__ */ jsx(TaskStatusText, { status: "killed", label: "stopped" });
        $[2] = t1;
      } else {
        t1 = $[2];
      }
      return t1;
    }
    case "running":
    case "pending": {
      let t1;
      if ($[3] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t1 = /* @__PURE__ */ jsx(TaskStatusText, { status: "running" });
        $[3] = t1;
      } else {
        t1 = $[3];
      }
      return t1;
    }
  }
}
export {
  ShellProgress,
  TaskStatusText
};
