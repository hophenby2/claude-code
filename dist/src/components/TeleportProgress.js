import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { useState } from "react";
import { Box, Text, useAnimationFrame } from "../ink.js";
import { AppStateProvider } from "../state/AppState.js";
import { checkOutTeleportedSessionBranch, processMessagesForTeleportResume, teleportResumeCodeSession } from "../utils/teleport.js";
const SPINNER_FRAMES = ["\u25D0", "\u25D3", "\u25D1", "\u25D2"];
const STEPS = [{
  key: "validating",
  label: "Validating session"
}, {
  key: "fetching_logs",
  label: "Fetching session logs"
}, {
  key: "fetching_branch",
  label: "Getting branch info"
}, {
  key: "checking_out",
  label: "Checking out branch"
}];
function TeleportProgress(t0) {
  const $ = _c(16);
  const {
    currentStep,
    sessionId
  } = t0;
  const [ref, time] = useAnimationFrame(100);
  const frame = Math.floor(time / 100) % SPINNER_FRAMES.length;
  let t1;
  if ($[0] !== currentStep) {
    t1 = (s) => s.key === currentStep;
    $[0] = currentStep;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const currentStepIndex = STEPS.findIndex(t1);
  const t2 = SPINNER_FRAMES[frame];
  let t3;
  if ($[2] !== t2) {
    t3 = /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsxs(Text, { bold: true, color: "claude", children: [
      t2,
      " Teleporting session\u2026"
    ] }) });
    $[2] = t2;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  let t4;
  if ($[4] !== sessionId) {
    t4 = sessionId && /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: sessionId }) });
    $[4] = sessionId;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  let t5;
  if ($[6] !== currentStepIndex || $[7] !== frame) {
    t5 = STEPS.map((step, index) => {
      const isComplete = index < currentStepIndex;
      const isCurrent = index === currentStepIndex;
      const isPending = index > currentStepIndex;
      let icon;
      let color;
      if (isComplete) {
        icon = figures.tick;
        color = "green";
      } else {
        if (isCurrent) {
          icon = SPINNER_FRAMES[frame];
          color = "claude";
        } else {
          icon = figures.circle;
          color = void 0;
        }
      }
      return /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
        /* @__PURE__ */ jsx(Box, { width: 2, children: /* @__PURE__ */ jsx(Text, { color, dimColor: isPending, children: icon }) }),
        /* @__PURE__ */ jsx(Text, { dimColor: isPending, bold: isCurrent, children: step.label })
      ] }, step.key);
    });
    $[6] = currentStepIndex;
    $[7] = frame;
    $[8] = t5;
  } else {
    t5 = $[8];
  }
  let t6;
  if ($[9] !== t5) {
    t6 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginLeft: 2, children: t5 });
    $[9] = t5;
    $[10] = t6;
  } else {
    t6 = $[10];
  }
  let t7;
  if ($[11] !== ref || $[12] !== t3 || $[13] !== t4 || $[14] !== t6) {
    t7 = /* @__PURE__ */ jsxs(Box, { ref, flexDirection: "column", paddingX: 1, paddingY: 1, children: [
      t3,
      t4,
      t6
    ] });
    $[11] = ref;
    $[12] = t3;
    $[13] = t4;
    $[14] = t6;
    $[15] = t7;
  } else {
    t7 = $[15];
  }
  return t7;
}
async function teleportWithProgress(root, sessionId) {
  let setStep = () => {
  };
  function TeleportProgressWrapper() {
    const [step, _setStep] = useState("validating");
    setStep = _setStep;
    return /* @__PURE__ */ jsx(TeleportProgress, { currentStep: step, sessionId });
  }
  root.render(/* @__PURE__ */ jsx(AppStateProvider, { children: /* @__PURE__ */ jsx(TeleportProgressWrapper, {}) }));
  const result = await teleportResumeCodeSession(sessionId, setStep);
  setStep("checking_out");
  const {
    branchName,
    branchError
  } = await checkOutTeleportedSessionBranch(result.branch);
  return {
    messages: processMessagesForTeleportResume(result.log, branchError),
    branchName
  };
}
export {
  TeleportProgress,
  teleportWithProgress
};
