const feature = (_name) => false;
import z from "zod/v4";
import { PAUSE_ICON } from "../../constants/figures.js";
import {
  EXTERNAL_PERMISSION_MODES,
  PERMISSION_MODES
} from "../../types/permissions.js";
import { lazySchema } from "../lazySchema.js";
const permissionModeSchema = lazySchema(() => z.enum(PERMISSION_MODES));
const externalPermissionModeSchema = lazySchema(
  () => z.enum(EXTERNAL_PERMISSION_MODES)
);
const PERMISSION_MODE_CONFIG = {
  default: {
    title: "Default",
    shortTitle: "Default",
    symbol: "",
    color: "text",
    external: "default"
  },
  plan: {
    title: "Plan Mode",
    shortTitle: "Plan",
    symbol: PAUSE_ICON,
    color: "planMode",
    external: "plan"
  },
  acceptEdits: {
    title: "Accept edits",
    shortTitle: "Accept",
    symbol: "\u23F5\u23F5",
    color: "autoAccept",
    external: "acceptEdits"
  },
  bypassPermissions: {
    title: "Bypass Permissions",
    shortTitle: "Bypass",
    symbol: "\u23F5\u23F5",
    color: "error",
    external: "bypassPermissions"
  },
  dontAsk: {
    title: "Don't Ask",
    shortTitle: "DontAsk",
    symbol: "\u23F5\u23F5",
    color: "error",
    external: "dontAsk"
  },
  ...false ? {
    auto: {
      title: "Auto mode",
      shortTitle: "Auto",
      symbol: "\u23F5\u23F5",
      color: "warning",
      external: "default"
    }
  } : {}
};
function isExternalPermissionMode(mode) {
  if (process.env.USER_TYPE !== "ant") {
    return true;
  }
  return mode !== "auto" && mode !== "bubble";
}
function getModeConfig(mode) {
  return PERMISSION_MODE_CONFIG[mode] ?? PERMISSION_MODE_CONFIG.default;
}
function toExternalPermissionMode(mode) {
  return getModeConfig(mode).external;
}
function permissionModeFromString(str) {
  return PERMISSION_MODES.includes(str) ? str : "default";
}
function permissionModeTitle(mode) {
  return getModeConfig(mode).title;
}
function isDefaultMode(mode) {
  return mode === "default" || mode === void 0;
}
function permissionModeShortTitle(mode) {
  return getModeConfig(mode).shortTitle;
}
function permissionModeSymbol(mode) {
  return getModeConfig(mode).symbol;
}
function getModeColor(mode) {
  return getModeConfig(mode).color;
}
export {
  EXTERNAL_PERMISSION_MODES,
  PERMISSION_MODES,
  externalPermissionModeSchema,
  getModeColor,
  isDefaultMode,
  isExternalPermissionMode,
  permissionModeFromString,
  permissionModeSchema,
  permissionModeShortTitle,
  permissionModeSymbol,
  permissionModeTitle,
  toExternalPermissionMode
};
