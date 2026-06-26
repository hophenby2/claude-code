const feature = (_name) => false;
import { z } from "zod/v4";
import { getKairosActive, setUserMsgOptIn } from "../bootstrap/state.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import {
  logEvent
} from "../services/analytics/index.js";
import { isBriefEntitled } from "../tools/BriefTool/BriefTool.js";
import { BRIEF_TOOL_NAME } from "../tools/BriefTool/prompt.js";
import { lazySchema } from "../utils/lazySchema.js";
const briefConfigSchema = lazySchema(
  () => z.object({
    enable_slash_command: z.boolean()
  })
);
const DEFAULT_BRIEF_CONFIG = {
  enable_slash_command: false
};
function getBriefConfig() {
  const raw = getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_kairos_brief_config",
    DEFAULT_BRIEF_CONFIG
  );
  const parsed = briefConfigSchema().safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_BRIEF_CONFIG;
}
const brief = {
  type: "local-jsx",
  name: "brief",
  description: "Toggle brief-only mode",
  isEnabled: () => {
    if (false) {
      return getBriefConfig().enable_slash_command;
    }
    return false;
  },
  immediate: true,
  load: () => Promise.resolve({
    async call(onDone, context) {
      const current = context.getAppState().isBriefOnly;
      const newState = !current;
      if (newState && !isBriefEntitled()) {
        logEvent("tengu_brief_mode_toggled", {
          enabled: false,
          gated: true,
          source: "slash_command"
        });
        onDone("Brief tool is not enabled for your account", {
          display: "system"
        });
        return null;
      }
      setUserMsgOptIn(newState);
      context.setAppState((prev) => {
        if (prev.isBriefOnly === newState) return prev;
        return { ...prev, isBriefOnly: newState };
      });
      logEvent("tengu_brief_mode_toggled", {
        enabled: newState,
        gated: false,
        source: "slash_command"
      });
      const metaMessages = getKairosActive() ? void 0 : [
        `<system-reminder>
${newState ? `Brief mode is now enabled. Use the ${BRIEF_TOOL_NAME} tool for all user-facing output \u2014 plain text outside it is hidden from the user's view.` : `Brief mode is now disabled. The ${BRIEF_TOOL_NAME} tool is no longer available \u2014 reply with plain text.`}
</system-reminder>`
      ];
      onDone(
        newState ? "Brief-only mode enabled" : "Brief-only mode disabled",
        { display: "system", metaMessages }
      );
      return null;
    }
  })
};
var brief_default = brief;
export {
  brief_default as default
};
