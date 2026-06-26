const feature = (_name) => false;
import { clearSystemPromptSections } from "../../constants/systemPromptSections.js";
import { getUserContext } from "../../context.js";
import { clearSpeculativeChecks } from "../../tools/BashTool/bashPermissions.js";
import { clearClassifierApprovals } from "../../utils/classifierApprovals.js";
import { resetGetMemoryFilesCache } from "../../utils/claudemd.js";
import { clearSessionMessagesCache } from "../../utils/sessionStorage.js";
import { clearBetaTracingState } from "../../utils/telemetry/betaSessionTracing.js";
import { resetMicrocompactState } from "./microCompact.js";
function runPostCompactCleanup(querySource) {
  const isMainThreadCompact = querySource === void 0 || querySource.startsWith("repl_main_thread") || querySource === "sdk";
  resetMicrocompactState();
  if (false) {
    if (isMainThreadCompact) {
      ;
      null.resetContextCollapse();
    }
  }
  if (isMainThreadCompact) {
    getUserContext.cache.clear?.();
    resetGetMemoryFilesCache("compact");
  }
  clearSystemPromptSections();
  clearClassifierApprovals();
  clearSpeculativeChecks();
  clearBetaTracingState();
  if (false) {
    void null.then(
      (m) => m.sweepFileContentCache()
    );
  }
  clearSessionMessagesCache();
}
export {
  runPostCompactCleanup
};
