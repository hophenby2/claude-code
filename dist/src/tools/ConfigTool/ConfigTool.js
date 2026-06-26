const feature = (_name) => false;
import { z } from "zod/v4";
import {
  logEvent
} from "../../services/analytics/index.js";
import { buildTool } from "../../Tool.js";
import {
  getGlobalConfig,
  getRemoteControlAtStartup,
  saveGlobalConfig
} from "../../utils/config.js";
import { errorMessage } from "../../utils/errors.js";
import { lazySchema } from "../../utils/lazySchema.js";
import { logError } from "../../utils/log.js";
import {
  getInitialSettings,
  updateSettingsForSource
} from "../../utils/settings/settings.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import { CONFIG_TOOL_NAME } from "./constants.js";
import { DESCRIPTION, generatePrompt } from "./prompt.js";
import {
  getConfig,
  getOptionsForSetting,
  getPath,
  isSupported
} from "./supportedSettings.js";
import {
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseRejectedMessage
} from "./UI.js";
const inputSchema = lazySchema(
  () => z.strictObject({
    setting: z.string().describe(
      'The setting key (e.g., "theme", "model", "permissions.defaultMode")'
    ),
    value: z.union([z.string(), z.boolean(), z.number()]).optional().describe("The new value. Omit to get current value.")
  })
);
const outputSchema = lazySchema(
  () => z.object({
    success: z.boolean(),
    operation: z.enum(["get", "set"]).optional(),
    setting: z.string().optional(),
    value: z.unknown().optional(),
    previousValue: z.unknown().optional(),
    newValue: z.unknown().optional(),
    error: z.string().optional()
  })
);
const ConfigTool = buildTool({
  name: CONFIG_TOOL_NAME,
  searchHint: "get or set Claude Code settings (theme, model)",
  maxResultSizeChars: 1e5,
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    return generatePrompt();
  },
  get inputSchema() {
    return inputSchema();
  },
  get outputSchema() {
    return outputSchema();
  },
  userFacingName() {
    return "Config";
  },
  shouldDefer: true,
  isConcurrencySafe() {
    return true;
  },
  isReadOnly(input) {
    return input.value === void 0;
  },
  toAutoClassifierInput(input) {
    return input.value === void 0 ? input.setting : `${input.setting} = ${input.value}`;
  },
  async checkPermissions(input) {
    if (input.value === void 0) {
      return { behavior: "allow", updatedInput: input };
    }
    return {
      behavior: "ask",
      message: `Set ${input.setting} to ${jsonStringify(input.value)}`
    };
  },
  renderToolUseMessage,
  renderToolResultMessage,
  renderToolUseRejectedMessage,
  async call({ setting, value }, context) {
    if (false) {
      const { isVoiceGrowthBookEnabled } = await null;
      if (!isVoiceGrowthBookEnabled()) {
        return {
          data: { success: false, error: `Unknown setting: "${setting}"` }
        };
      }
    }
    if (!isSupported(setting)) {
      return {
        data: { success: false, error: `Unknown setting: "${setting}"` }
      };
    }
    const config = getConfig(setting);
    const path = getPath(setting);
    if (value === void 0) {
      const currentValue = getValue(config.source, path);
      const displayValue = config.formatOnRead ? config.formatOnRead(currentValue) : currentValue;
      return {
        data: { success: true, operation: "get", setting, value: displayValue }
      };
    }
    if (setting === "remoteControlAtStartup" && typeof value === "string" && value.toLowerCase().trim() === "default") {
      saveGlobalConfig((prev) => {
        if (prev.remoteControlAtStartup === void 0) return prev;
        const next = { ...prev };
        delete next.remoteControlAtStartup;
        return next;
      });
      const resolved = getRemoteControlAtStartup();
      context.setAppState((prev) => {
        if (prev.replBridgeEnabled === resolved && !prev.replBridgeOutboundOnly)
          return prev;
        return {
          ...prev,
          replBridgeEnabled: resolved,
          replBridgeOutboundOnly: false
        };
      });
      return {
        data: {
          success: true,
          operation: "set",
          setting,
          value: resolved
        }
      };
    }
    let finalValue = value;
    if (config.type === "boolean") {
      if (typeof value === "string") {
        const lower = value.toLowerCase().trim();
        if (lower === "true") finalValue = true;
        else if (lower === "false") finalValue = false;
      }
      if (typeof finalValue !== "boolean") {
        return {
          data: {
            success: false,
            operation: "set",
            setting,
            error: `${setting} requires true or false.`
          }
        };
      }
    }
    const options = getOptionsForSetting(setting);
    if (options && !options.includes(String(finalValue))) {
      return {
        data: {
          success: false,
          operation: "set",
          setting,
          error: `Invalid value "${value}". Options: ${options.join(", ")}`
        }
      };
    }
    if (config.validateOnWrite) {
      const result = await config.validateOnWrite(finalValue);
      if (!result.valid) {
        return {
          data: {
            success: false,
            operation: "set",
            setting,
            error: result.error
          }
        };
      }
    }
    if (false) {
      const { isVoiceModeEnabled } = await null;
      if (!isVoiceModeEnabled()) {
        const { isAnthropicAuthEnabled } = await null;
        return {
          data: {
            success: false,
            error: !isAnthropicAuthEnabled() ? "Voice mode requires a Claude.ai account. Please run /login to sign in." : "Voice mode is not available."
          }
        };
      }
      const { isVoiceStreamAvailable } = await null;
      const {
        checkRecordingAvailability,
        checkVoiceDependencies,
        requestMicrophonePermission
      } = await null;
      const recording = await checkRecordingAvailability();
      if (!recording.available) {
        return {
          data: {
            success: false,
            error: recording.reason ?? "Voice mode is not available in this environment."
          }
        };
      }
      if (!isVoiceStreamAvailable()) {
        return {
          data: {
            success: false,
            error: "Voice mode requires a Claude.ai account. Please run /login to sign in."
          }
        };
      }
      const deps = await checkVoiceDependencies();
      if (!deps.available) {
        return {
          data: {
            success: false,
            error: "No audio recording tool found." + (deps.installCommand ? ` Run: ${deps.installCommand}` : "")
          }
        };
      }
      if (!await requestMicrophonePermission()) {
        let guidance;
        if (process.platform === "win32") {
          guidance = "Settings \u2192 Privacy \u2192 Microphone";
        } else if (process.platform === "linux") {
          guidance = "your system's audio settings";
        } else {
          guidance = "System Settings \u2192 Privacy & Security \u2192 Microphone";
        }
        return {
          data: {
            success: false,
            error: `Microphone access is denied. To enable it, go to ${guidance}, then try again.`
          }
        };
      }
    }
    const previousValue = getValue(config.source, path);
    try {
      if (config.source === "global") {
        const key = path[0];
        if (!key) {
          return {
            data: {
              success: false,
              operation: "set",
              setting,
              error: "Invalid setting path"
            }
          };
        }
        saveGlobalConfig((prev) => {
          if (prev[key] === finalValue) return prev;
          return { ...prev, [key]: finalValue };
        });
      } else {
        const update = buildNestedObject(path, finalValue);
        const result = updateSettingsForSource("userSettings", update);
        if (result.error) {
          return {
            data: {
              success: false,
              operation: "set",
              setting,
              error: result.error.message
            }
          };
        }
      }
      if (false) {
        const { settingsChangeDetector } = await null;
        settingsChangeDetector.notifyChange("userSettings");
      }
      if (config.appStateKey) {
        const appKey = config.appStateKey;
        context.setAppState((prev) => {
          if (prev[appKey] === finalValue) return prev;
          return { ...prev, [appKey]: finalValue };
        });
      }
      if (setting === "remoteControlAtStartup") {
        const resolved = getRemoteControlAtStartup();
        context.setAppState((prev) => {
          if (prev.replBridgeEnabled === resolved && !prev.replBridgeOutboundOnly)
            return prev;
          return {
            ...prev,
            replBridgeEnabled: resolved,
            replBridgeOutboundOnly: false
          };
        });
      }
      logEvent("tengu_config_tool_changed", {
        setting,
        value: String(
          finalValue
        )
      });
      return {
        data: {
          success: true,
          operation: "set",
          setting,
          previousValue,
          newValue: finalValue
        }
      };
    } catch (error) {
      logError(error);
      return {
        data: {
          success: false,
          operation: "set",
          setting,
          error: errorMessage(error)
        }
      };
    }
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    if (content.success) {
      if (content.operation === "get") {
        return {
          tool_use_id: toolUseID,
          type: "tool_result",
          content: `${content.setting} = ${jsonStringify(content.value)}`
        };
      }
      return {
        tool_use_id: toolUseID,
        type: "tool_result",
        content: `Set ${content.setting} to ${jsonStringify(content.newValue)}`
      };
    }
    return {
      tool_use_id: toolUseID,
      type: "tool_result",
      content: `Error: ${content.error}`,
      is_error: true
    };
  }
});
function getValue(source, path) {
  if (source === "global") {
    const config = getGlobalConfig();
    const key = path[0];
    if (!key) return void 0;
    return config[key];
  }
  const settings = getInitialSettings();
  let current = settings;
  for (const key of path) {
    if (current && typeof current === "object" && key in current) {
      current = current[key];
    } else {
      return void 0;
    }
  }
  return current;
}
function buildNestedObject(path, value) {
  if (path.length === 0) {
    return {};
  }
  const key = path[0];
  if (path.length === 1) {
    return { [key]: value };
  }
  return { [key]: buildNestedObject(path.slice(1), value) };
}
export {
  ConfigTool
};
