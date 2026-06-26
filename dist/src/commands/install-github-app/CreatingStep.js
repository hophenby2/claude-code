import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Box, Text } from "../../ink.js";
function CreatingStep(t0) {
  const $ = _c(10);
  const {
    currentWorkflowInstallStep,
    secretExists,
    useExistingSecret,
    secretName,
    skipWorkflow: t1,
    selectedWorkflows
  } = t0;
  const skipWorkflow = t1 === void 0 ? false : t1;
  let t2;
  if ($[0] !== secretExists || $[1] !== secretName || $[2] !== selectedWorkflows || $[3] !== skipWorkflow || $[4] !== useExistingSecret) {
    t2 = skipWorkflow ? ["Getting repository information", secretExists && useExistingSecret ? "Using existing API key secret" : `Setting up ${secretName} secret`] : ["Getting repository information", "Creating branch", selectedWorkflows.length > 1 ? "Creating workflow files" : "Creating workflow file", secretExists && useExistingSecret ? "Using existing API key secret" : `Setting up ${secretName} secret`, "Opening pull request page"];
    $[0] = secretExists;
    $[1] = secretName;
    $[2] = selectedWorkflows;
    $[3] = skipWorkflow;
    $[4] = useExistingSecret;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  const progressSteps = t2;
  let t3;
  if ($[6] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t3 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [
      /* @__PURE__ */ jsx(Text, { bold: true, children: "Install GitHub App" }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Create GitHub Actions workflow" })
    ] });
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] !== currentWorkflowInstallStep || $[8] !== progressSteps) {
    t4 = /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", borderStyle: "round", paddingX: 1, children: [
      t3,
      progressSteps.map((stepText, index) => {
        let status = "pending";
        if (index < currentWorkflowInstallStep) {
          status = "completed";
        } else {
          if (index === currentWorkflowInstallStep) {
            status = "in-progress";
          }
        }
        return /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { color: status === "completed" ? "success" : status === "in-progress" ? "warning" : void 0, children: [
          status === "completed" ? "\u2713 " : "",
          stepText,
          status === "in-progress" ? "\u2026" : ""
        ] }) }, index);
      })
    ] }) });
    $[7] = currentWorkflowInstallStep;
    $[8] = progressSteps;
    $[9] = t4;
  } else {
    t4 = $[9];
  }
  return t4;
}
export {
  CreatingStep
};
