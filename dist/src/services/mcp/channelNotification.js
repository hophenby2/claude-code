import { z } from "zod/v4";
import { getAllowedChannels } from "../../bootstrap/state.js";
import { CHANNEL_TAG } from "../../constants/xml.js";
import {
  getClaudeAIOAuthTokens,
  getSubscriptionType
} from "../../utils/auth.js";
import { lazySchema } from "../../utils/lazySchema.js";
import { parsePluginIdentifier } from "../../utils/plugins/pluginIdentifier.js";
import { getSettingsForSource } from "../../utils/settings/settings.js";
import { escapeXmlAttr } from "../../utils/xml.js";
import {
  getChannelAllowlist,
  isChannelsEnabled
} from "./channelAllowlist.js";
const ChannelMessageNotificationSchema = lazySchema(
  () => z.object({
    method: z.literal("notifications/claude/channel"),
    params: z.object({
      content: z.string(),
      // Opaque passthrough — thread_id, user, whatever the channel wants the
      // model to see. Rendered as attributes on the <channel> tag.
      meta: z.record(z.string(), z.string()).optional()
    })
  })
);
const CHANNEL_PERMISSION_METHOD = "notifications/claude/channel/permission";
const ChannelPermissionNotificationSchema = lazySchema(
  () => z.object({
    method: z.literal(CHANNEL_PERMISSION_METHOD),
    params: z.object({
      request_id: z.string(),
      behavior: z.enum(["allow", "deny"])
    })
  })
);
const CHANNEL_PERMISSION_REQUEST_METHOD = "notifications/claude/channel/permission_request";
const SAFE_META_KEY = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function wrapChannelMessage(serverName, content, meta) {
  const attrs = Object.entries(meta ?? {}).filter(([k]) => SAFE_META_KEY.test(k)).map(([k, v]) => ` ${k}="${escapeXmlAttr(v)}"`).join("");
  return `<${CHANNEL_TAG} source="${escapeXmlAttr(serverName)}"${attrs}>
${content}
</${CHANNEL_TAG}>`;
}
function getEffectiveChannelAllowlist(sub, orgList) {
  if ((sub === "team" || sub === "enterprise") && orgList) {
    return { entries: orgList, source: "org" };
  }
  return { entries: getChannelAllowlist(), source: "ledger" };
}
function findChannelEntry(serverName, channels) {
  const parts = serverName.split(":");
  return channels.find(
    (c) => c.kind === "server" ? serverName === c.name : parts[0] === "plugin" && parts[1] === c.name
  );
}
function gateChannelServer(serverName, capabilities, pluginSource) {
  if (!capabilities?.experimental?.["claude/channel"]) {
    return {
      action: "skip",
      kind: "capability",
      reason: "server did not declare claude/channel capability"
    };
  }
  if (!isChannelsEnabled()) {
    return {
      action: "skip",
      kind: "disabled",
      reason: "channels feature is not currently available"
    };
  }
  if (!getClaudeAIOAuthTokens()?.accessToken) {
    return {
      action: "skip",
      kind: "auth",
      reason: "channels requires claude.ai authentication (run /login)"
    };
  }
  const sub = getSubscriptionType();
  const managed = sub === "team" || sub === "enterprise";
  const policy = managed ? getSettingsForSource("policySettings") : void 0;
  if (managed && policy?.channelsEnabled !== true) {
    return {
      action: "skip",
      kind: "policy",
      reason: "channels not enabled by org policy (set channelsEnabled: true in managed settings)"
    };
  }
  const entry = findChannelEntry(serverName, getAllowedChannels());
  if (!entry) {
    return {
      action: "skip",
      kind: "session",
      reason: `server ${serverName} not in --channels list for this session`
    };
  }
  if (entry.kind === "plugin") {
    const actual = pluginSource ? parsePluginIdentifier(pluginSource).marketplace : void 0;
    if (actual !== entry.marketplace) {
      return {
        action: "skip",
        kind: "marketplace",
        reason: `you asked for plugin:${entry.name}@${entry.marketplace} but the installed ${entry.name} plugin is from ${actual ?? "an unknown source"}`
      };
    }
    if (!entry.dev) {
      const { entries, source } = getEffectiveChannelAllowlist(
        sub,
        policy?.allowedChannelPlugins
      );
      if (!entries.some(
        (e) => e.plugin === entry.name && e.marketplace === entry.marketplace
      )) {
        return {
          action: "skip",
          kind: "allowlist",
          reason: source === "org" ? `plugin ${entry.name}@${entry.marketplace} is not on your org's approved channels list (set allowedChannelPlugins in managed settings)` : `plugin ${entry.name}@${entry.marketplace} is not on the approved channels allowlist (use --dangerously-load-development-channels for local dev)`
        };
      }
    }
  } else {
    if (!entry.dev) {
      return {
        action: "skip",
        kind: "allowlist",
        reason: `server ${entry.name} is not on the approved channels allowlist (use --dangerously-load-development-channels for local dev)`
      };
    }
  }
  return { action: "register" };
}
export {
  CHANNEL_PERMISSION_METHOD,
  CHANNEL_PERMISSION_REQUEST_METHOD,
  ChannelMessageNotificationSchema,
  ChannelPermissionNotificationSchema,
  findChannelEntry,
  gateChannelServer,
  getEffectiveChannelAllowlist,
  wrapChannelMessage
};
