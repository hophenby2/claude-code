const feature = (_name) => false;
import { z } from "zod/v4";
import "../../bootstrap/state.js";
import "../../services/analytics/growthbook.js";
import { logEvent } from "../../services/analytics/index.js";
import { buildTool } from "../../Tool.js";
import "../../utils/envUtils.js";
import { lazySchema } from "../../utils/lazySchema.js";
import { plural } from "../../utils/stringUtils.js";
import { resolveAttachments, validateAttachmentPaths } from "./attachments.js";
import {
  BRIEF_TOOL_NAME,
  BRIEF_TOOL_PROMPT,
  DESCRIPTION,
  LEGACY_BRIEF_TOOL_NAME
} from "./prompt.js";
import { renderToolResultMessage, renderToolUseMessage } from "./UI.js";
const inputSchema = lazySchema(
  () => z.strictObject({
    message: z.string().describe("The message for the user. Supports markdown formatting."),
    attachments: z.array(z.string()).optional().describe(
      "Optional file paths (absolute or relative to cwd) to attach. Use for photos, screenshots, diffs, logs, or any file the user should see alongside your message."
    ),
    status: z.enum(["normal", "proactive"]).describe(
      "Use 'proactive' when you're surfacing something the user hasn't asked for and needs to see now \u2014 task completion while they're away, a blocker you hit, an unsolicited status update. Use 'normal' when replying to something the user just said."
    )
  })
);
const outputSchema = lazySchema(
  () => z.object({
    message: z.string().describe("The message"),
    attachments: z.array(
      z.object({
        path: z.string(),
        size: z.number(),
        isImage: z.boolean(),
        file_uuid: z.string().optional()
      })
    ).optional().describe("Resolved attachment metadata"),
    sentAt: z.string().optional().describe(
      "ISO timestamp captured at tool execution on the emitting process. Optional \u2014 resumed sessions replay pre-sentAt outputs verbatim."
    )
  })
);
const KAIROS_BRIEF_REFRESH_MS = 5 * 60 * 1e3;
function isBriefEntitled() {
  return false ? getKairosActive() || isEnvTruthy(process.env.CLAUDE_CODE_BRIEF) || getFeatureValue_CACHED_WITH_REFRESH(
    "tengu_kairos_brief",
    false,
    KAIROS_BRIEF_REFRESH_MS
  ) : false;
}
function isBriefEnabled() {
  return false ? (getKairosActive() || getUserMsgOptIn()) && isBriefEntitled() : false;
}
const BriefTool = buildTool({
  name: BRIEF_TOOL_NAME,
  aliases: [LEGACY_BRIEF_TOOL_NAME],
  searchHint: "send a message to the user \u2014 your primary visible output channel",
  maxResultSizeChars: 1e5,
  userFacingName() {
    return "";
  },
  get inputSchema() {
    return inputSchema();
  },
  get outputSchema() {
    return outputSchema();
  },
  isEnabled() {
    return isBriefEnabled();
  },
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  toAutoClassifierInput(input) {
    return input.message;
  },
  async validateInput({ attachments }, _context) {
    if (!attachments || attachments.length === 0) {
      return { result: true };
    }
    return validateAttachmentPaths(attachments);
  },
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    return BRIEF_TOOL_PROMPT;
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    const n = output.attachments?.length ?? 0;
    const suffix = n === 0 ? "" : ` (${n} ${plural(n, "attachment")} included)`;
    return {
      tool_use_id: toolUseID,
      type: "tool_result",
      content: `Message delivered to user.${suffix}`
    };
  },
  renderToolUseMessage,
  renderToolResultMessage,
  async call({ message, attachments, status }, context) {
    const sentAt = (/* @__PURE__ */ new Date()).toISOString();
    logEvent("tengu_brief_send", {
      proactive: status === "proactive",
      attachment_count: attachments?.length ?? 0
    });
    if (!attachments || attachments.length === 0) {
      return { data: { message, sentAt } };
    }
    const appState = context.getAppState();
    const resolved = await resolveAttachments(attachments, {
      replBridgeEnabled: appState.replBridgeEnabled,
      signal: context.abortController.signal
    });
    return {
      data: { message, attachments: resolved, sentAt }
    };
  }
});
export {
  BriefTool,
  isBriefEnabled,
  isBriefEntitled
};
