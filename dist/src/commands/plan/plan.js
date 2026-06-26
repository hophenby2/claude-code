import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { handlePlanModeTransition } from "../../bootstrap/state.js";
import { Box, Text } from "../../ink.js";
import { getExternalEditor } from "../../utils/editor.js";
import { toIDEDisplayName } from "../../utils/ide.js";
import { applyPermissionUpdate } from "../../utils/permissions/PermissionUpdate.js";
import { prepareContextForPlanMode } from "../../utils/permissions/permissionSetup.js";
import { getPlan, getPlanFilePath } from "../../utils/plans.js";
import { editFileInEditor } from "../../utils/promptEditor.js";
import { renderToString } from "../../utils/staticRender.js";
function PlanDisplay(t0) {
  const $ = _c(11);
  const {
    planContent,
    planPath,
    editorName
  } = t0;
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = /* @__PURE__ */ jsx(Text, { bold: true, children: "Current Plan" });
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  let t2;
  if ($[1] !== planPath) {
    t2 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: planPath });
    $[1] = planPath;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== planContent) {
    t3 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { children: planContent }) });
    $[3] = planContent;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  if ($[5] !== editorName) {
    t4 = editorName && /* @__PURE__ */ jsxs(Box, { marginTop: 1, children: [
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: '"/plan open"' }),
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: " to edit this plan in " }),
      /* @__PURE__ */ jsx(Text, { bold: true, dimColor: true, children: editorName })
    ] });
    $[5] = editorName;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  let t5;
  if ($[7] !== t2 || $[8] !== t3 || $[9] !== t4) {
    t5 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t1,
      t2,
      t3,
      t4
    ] });
    $[7] = t2;
    $[8] = t3;
    $[9] = t4;
    $[10] = t5;
  } else {
    t5 = $[10];
  }
  return t5;
}
async function call(onDone, context, args) {
  const {
    getAppState,
    setAppState
  } = context;
  const appState = getAppState();
  const currentMode = appState.toolPermissionContext.mode;
  if (currentMode !== "plan") {
    handlePlanModeTransition(currentMode, "plan");
    setAppState((prev) => ({
      ...prev,
      toolPermissionContext: applyPermissionUpdate(prepareContextForPlanMode(prev.toolPermissionContext), {
        type: "setMode",
        mode: "plan",
        destination: "session"
      })
    }));
    const description = args.trim();
    if (description && description !== "open") {
      onDone("Enabled plan mode", {
        shouldQuery: true
      });
    } else {
      onDone("Enabled plan mode");
    }
    return null;
  }
  const planContent = getPlan();
  const planPath = getPlanFilePath();
  if (!planContent) {
    onDone("Already in plan mode. No plan written yet.");
    return null;
  }
  const argList = args.trim().split(/\s+/);
  if (argList[0] === "open") {
    const result = await editFileInEditor(planPath);
    if (result.error) {
      onDone(`Failed to open plan in editor: ${result.error}`);
    } else {
      onDone(`Opened plan in editor: ${planPath}`);
    }
    return null;
  }
  const editor = getExternalEditor();
  const editorName = editor ? toIDEDisplayName(editor) : void 0;
  const display = /* @__PURE__ */ jsx(PlanDisplay, { planContent, planPath, editorName });
  const output = await renderToString(display);
  onDone(output);
  return null;
}
export {
  call
};
