import { jsx } from "react/jsx-runtime";
import { checkOverageGate, confirmOverage, launchRemoteReview } from "./reviewRemote.js";
import { UltrareviewOverageDialog } from "./UltrareviewOverageDialog.js";
function contentBlocksToString(blocks) {
  return blocks.map((b) => b.type === "text" ? b.text : "").filter(Boolean).join("\n");
}
async function launchAndDone(args, context, onDone, billingNote, signal) {
  const result = await launchRemoteReview(args, context, billingNote);
  if (signal?.aborted) return;
  if (result) {
    onDone(contentBlocksToString(result), {
      shouldQuery: true
    });
  } else {
    onDone("Ultrareview failed to launch the remote session. Check that this is a GitHub repo and try again.", {
      display: "system"
    });
  }
}
const call = async (onDone, context, args) => {
  const gate = await checkOverageGate();
  if (gate.kind === "not-enabled") {
    onDone("Free ultrareviews used. Enable Extra Usage at https://claude.ai/settings/billing to continue.", {
      display: "system"
    });
    return null;
  }
  if (gate.kind === "low-balance") {
    onDone(`Balance too low to launch ultrareview ($${gate.available.toFixed(2)} available, $10 minimum). Top up at https://claude.ai/settings/billing`, {
      display: "system"
    });
    return null;
  }
  if (gate.kind === "needs-confirm") {
    return /* @__PURE__ */ jsx(UltrareviewOverageDialog, { onProceed: async (signal) => {
      await launchAndDone(args, context, onDone, " This review bills as Extra Usage.", signal);
      if (!signal.aborted) confirmOverage();
    }, onCancel: () => onDone("Ultrareview cancelled.", {
      display: "system"
    }) });
  }
  await launchAndDone(args, context, onDone, gate.billingNote);
  return null;
};
export {
  call
};
