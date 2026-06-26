import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
const feature = (_name) => false;
import { Box, Text, useTheme, useThemeSetting, useTerminalFocus } from "../../ink.js";
import * as React from "react";
import { useState, useCallback } from "react";
import { useKeybinding, useKeybindings } from "../../keybindings/useKeybinding.js";
import figures from "figures";
import { saveGlobalConfig, getCurrentProjectConfig } from "../../utils/config.js";
import { normalizeApiKeyForConfig } from "../../utils/authPortable.js";
import { getGlobalConfig, getAutoUpdaterDisabledReason, formatAutoUpdaterDisabledReason } from "../../utils/config.js";
import chalk from "chalk";
import { permissionModeTitle, permissionModeFromString, toExternalPermissionMode, isExternalPermissionMode, EXTERNAL_PERMISSION_MODES } from "../../utils/permissions/PermissionMode.js";
import { transitionPlanAutoMode } from "../../utils/permissions/permissionSetup.js";
import { logError } from "../../utils/log.js";
import { logEvent } from "../../services/analytics/index.js";
import "../../bridge/bridgeEnabled.js";
import { ThemePicker } from "../ThemePicker.js";
import { useAppState, useSetAppState, useAppStateStore } from "../../state/AppState.js";
import { ModelPicker } from "../ModelPicker.js";
import { modelDisplayString, isOpus1mMergeEnabled } from "../../utils/model/model.js";
import { isBilledAsExtraUsage } from "../../utils/extraUsage.js";
import { ClaudeMdExternalIncludesDialog } from "../ClaudeMdExternalIncludesDialog.js";
import { ChannelDowngradeDialog } from "../ChannelDowngradeDialog.js";
import { Dialog } from "../design-system/Dialog.js";
import { Select } from "../CustomSelect/index.js";
import { OutputStylePicker } from "../OutputStylePicker.js";
import { LanguagePicker } from "../LanguagePicker.js";
import { getExternalClaudeMdIncludes, getMemoryFiles, hasExternalClaudeMdIncludes } from "../../utils/claudemd.js";
import { KeyboardShortcutHint } from "../design-system/KeyboardShortcutHint.js";
import { ConfigurableShortcutHint } from "../ConfigurableShortcutHint.js";
import { Byline } from "../design-system/Byline.js";
import { useTabHeaderFocus } from "../design-system/Tabs.js";
import { useIsInsideModal } from "../../context/modalContext.js";
import { SearchBox } from "../SearchBox.js";
import { isSupportedTerminal, hasAccessToIDEExtensionDiffFeature } from "../../utils/ide.js";
import { getInitialSettings, getSettingsForSource, updateSettingsForSource } from "../../utils/settings/settings.js";
import { getUserMsgOptIn, setUserMsgOptIn } from "../../bootstrap/state.js";
import { DEFAULT_OUTPUT_STYLE_NAME } from "../../constants/outputStyles.js";
import { isEnvTruthy, isRunningOnHomespace } from "../../utils/envUtils.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../../services/analytics/growthbook.js";
import { isAgentSwarmsEnabled } from "../../utils/agentSwarmsEnabled.js";
import { getCliTeammateModeOverride, clearCliTeammateModeOverride } from "../../utils/swarm/backends/teammateModeSnapshot.js";
import { getHardcodedTeammateModelFallback } from "../../utils/swarm/teammateModel.js";
import { useSearchInput } from "../../hooks/useSearchInput.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { clearFastModeCooldown, FAST_MODE_MODEL_DISPLAY, isFastModeAvailable, isFastModeEnabled, getFastModeModel, isFastModeSupportedByModel } from "../../utils/fastMode.js";
import { isFullscreenEnvEnabled } from "../../utils/fullscreen.js";
function Config({
  onClose,
  context,
  setTabsHidden,
  onIsSearchModeChange,
  contentHeight
}) {
  const {
    headerFocused,
    focusHeader
  } = useTabHeaderFocus();
  const insideModal = useIsInsideModal();
  const [, setTheme] = useTheme();
  const themeSetting = useThemeSetting();
  const [globalConfig, setGlobalConfig] = useState(getGlobalConfig());
  const initialConfig = React.useRef(getGlobalConfig());
  const [settingsData, setSettingsData] = useState(getInitialSettings());
  const initialSettingsData = React.useRef(getInitialSettings());
  const [currentOutputStyle, setCurrentOutputStyle] = useState(settingsData?.outputStyle || DEFAULT_OUTPUT_STYLE_NAME);
  const initialOutputStyle = React.useRef(currentOutputStyle);
  const [currentLanguage, setCurrentLanguage] = useState(settingsData?.language);
  const initialLanguage = React.useRef(currentLanguage);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isSearchMode, setIsSearchMode] = useState(true);
  const isTerminalFocused = useTerminalFocus();
  const {
    rows
  } = useTerminalSize();
  const paneCap = contentHeight ?? Math.min(Math.floor(rows * 0.8), 30);
  const maxVisible = Math.max(5, paneCap - 10);
  const mainLoopModel = useAppState((s) => s.mainLoopModel);
  const verbose = useAppState((s_0) => s_0.verbose);
  const thinkingEnabled = useAppState((s_1) => s_1.thinkingEnabled);
  const isFastMode = useAppState((s_2) => isFastModeEnabled() ? s_2.fastMode : false);
  const promptSuggestionEnabled = useAppState((s_3) => s_3.promptSuggestionEnabled);
  const showAutoInDefaultModePicker = false ? hasAutoModeOptInAnySource() || getAutoModeEnabledState() === "enabled" : false;
  const showDefaultViewPicker = false ? null.isBriefEntitled() : false;
  const setAppState = useSetAppState();
  const [changes, setChanges] = useState({});
  const initialThinkingEnabled = React.useRef(thinkingEnabled);
  const [initialLocalSettings] = useState(() => getSettingsForSource("localSettings"));
  const [initialUserSettings] = useState(() => getSettingsForSource("userSettings"));
  const initialThemeSetting = React.useRef(themeSetting);
  const store = useAppStateStore();
  const [initialAppState] = useState(() => {
    const s_4 = store.getState();
    return {
      mainLoopModel: s_4.mainLoopModel,
      mainLoopModelForSession: s_4.mainLoopModelForSession,
      verbose: s_4.verbose,
      thinkingEnabled: s_4.thinkingEnabled,
      fastMode: s_4.fastMode,
      promptSuggestionEnabled: s_4.promptSuggestionEnabled,
      isBriefOnly: s_4.isBriefOnly,
      replBridgeEnabled: s_4.replBridgeEnabled,
      replBridgeOutboundOnly: s_4.replBridgeOutboundOnly,
      settings: s_4.settings
    };
  });
  const [initialUserMsgOptIn] = useState(() => getUserMsgOptIn());
  const isDirty = React.useRef(false);
  const [showThinkingWarning, setShowThinkingWarning] = useState(false);
  const [showSubmenu, setShowSubmenu] = useState(null);
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    cursorOffset: searchCursorOffset
  } = useSearchInput({
    isActive: isSearchMode && showSubmenu === null && !headerFocused,
    onExit: () => setIsSearchMode(false),
    onExitUp: focusHeader,
    // Ctrl+C/D must reach Settings' useExitOnCtrlCD; 'd' also avoids
    // double-action (delete-char + exit-pending).
    passthroughCtrlKeys: ["c", "d"]
  });
  const ownsEsc = isSearchMode && !headerFocused;
  React.useEffect(() => {
    onIsSearchModeChange?.(ownsEsc);
  }, [ownsEsc, onIsSearchModeChange]);
  const isConnectedToIde = hasAccessToIDEExtensionDiffFeature(context.options.mcpClients);
  const isFileCheckpointingAvailable = !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING);
  const memoryFiles = React.use(getMemoryFiles(true));
  const shouldShowExternalIncludesToggle = hasExternalClaudeMdIncludes(memoryFiles);
  const autoUpdaterDisabledReason = getAutoUpdaterDisabledReason();
  function onChangeMainModelConfig(value) {
    const previousModel = mainLoopModel;
    logEvent("tengu_config_model_changed", {
      from_model: previousModel,
      to_model: value
    });
    setAppState((prev) => ({
      ...prev,
      mainLoopModel: value,
      mainLoopModelForSession: null
    }));
    setChanges((prev_0) => {
      const valStr = modelDisplayString(value) + (isBilledAsExtraUsage(value, false, isOpus1mMergeEnabled()) ? " \xB7 Billed as extra usage" : "");
      if ("model" in prev_0) {
        const {
          model,
          ...rest
        } = prev_0;
        return {
          ...rest,
          model: valStr
        };
      }
      return {
        ...prev_0,
        model: valStr
      };
    });
  }
  function onChangeVerbose(value_0) {
    saveGlobalConfig((current) => ({
      ...current,
      verbose: value_0
    }));
    setGlobalConfig({
      ...getGlobalConfig(),
      verbose: value_0
    });
    setAppState((prev_1) => ({
      ...prev_1,
      verbose: value_0
    }));
    setChanges((prev_2) => {
      if ("verbose" in prev_2) {
        const {
          verbose: verbose_0,
          ...rest_0
        } = prev_2;
        return rest_0;
      }
      return {
        ...prev_2,
        verbose: value_0
      };
    });
  }
  const settingsItems = [
    // Global settings
    {
      id: "autoCompactEnabled",
      label: "Auto-compact",
      value: globalConfig.autoCompactEnabled,
      type: "boolean",
      onChange(autoCompactEnabled) {
        saveGlobalConfig((current_0) => ({
          ...current_0,
          autoCompactEnabled
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          autoCompactEnabled
        });
        logEvent("tengu_auto_compact_setting_changed", {
          enabled: autoCompactEnabled
        });
      }
    },
    {
      id: "spinnerTipsEnabled",
      label: "Show tips",
      value: settingsData?.spinnerTipsEnabled ?? true,
      type: "boolean",
      onChange(spinnerTipsEnabled) {
        updateSettingsForSource("localSettings", {
          spinnerTipsEnabled
        });
        setSettingsData((prev_3) => ({
          ...prev_3,
          spinnerTipsEnabled
        }));
        logEvent("tengu_tips_setting_changed", {
          enabled: spinnerTipsEnabled
        });
      }
    },
    {
      id: "prefersReducedMotion",
      label: "Reduce motion",
      value: settingsData?.prefersReducedMotion ?? false,
      type: "boolean",
      onChange(prefersReducedMotion) {
        updateSettingsForSource("localSettings", {
          prefersReducedMotion
        });
        setSettingsData((prev_4) => ({
          ...prev_4,
          prefersReducedMotion
        }));
        setAppState((prev_5) => ({
          ...prev_5,
          settings: {
            ...prev_5.settings,
            prefersReducedMotion
          }
        }));
        logEvent("tengu_reduce_motion_setting_changed", {
          enabled: prefersReducedMotion
        });
      }
    },
    {
      id: "thinkingEnabled",
      label: "Thinking mode",
      value: thinkingEnabled ?? true,
      type: "boolean",
      onChange(enabled) {
        setAppState((prev_6) => ({
          ...prev_6,
          thinkingEnabled: enabled
        }));
        updateSettingsForSource("userSettings", {
          alwaysThinkingEnabled: enabled ? void 0 : false
        });
        logEvent("tengu_thinking_toggled", {
          enabled
        });
      }
    },
    // Fast mode toggle (ant-only, eliminated from external builds)
    ...isFastModeEnabled() && isFastModeAvailable() ? [{
      id: "fastMode",
      label: `Fast mode (${FAST_MODE_MODEL_DISPLAY} only)`,
      value: !!isFastMode,
      type: "boolean",
      onChange(enabled_0) {
        clearFastModeCooldown();
        updateSettingsForSource("userSettings", {
          fastMode: enabled_0 ? true : void 0
        });
        if (enabled_0) {
          setAppState((prev_7) => ({
            ...prev_7,
            mainLoopModel: getFastModeModel(),
            mainLoopModelForSession: null,
            fastMode: true
          }));
          setChanges((prev_8) => ({
            ...prev_8,
            model: getFastModeModel(),
            "Fast mode": "ON"
          }));
        } else {
          setAppState((prev_9) => ({
            ...prev_9,
            fastMode: false
          }));
          setChanges((prev_10) => ({
            ...prev_10,
            "Fast mode": "OFF"
          }));
        }
      }
    }] : [],
    ...getFeatureValue_CACHED_MAY_BE_STALE("tengu_chomp_inflection", false) ? [{
      id: "promptSuggestionEnabled",
      label: "Prompt suggestions",
      value: promptSuggestionEnabled,
      type: "boolean",
      onChange(enabled_1) {
        setAppState((prev_11) => ({
          ...prev_11,
          promptSuggestionEnabled: enabled_1
        }));
        updateSettingsForSource("userSettings", {
          promptSuggestionEnabled: enabled_1 ? void 0 : false
        });
      }
    }] : [],
    // Speculation toggle (ant-only)
    ...false ? [{
      id: "speculationEnabled",
      label: "Speculative execution",
      value: globalConfig.speculationEnabled ?? true,
      type: "boolean",
      onChange(enabled_2) {
        saveGlobalConfig((current_1) => {
          if (current_1.speculationEnabled === enabled_2) return current_1;
          return {
            ...current_1,
            speculationEnabled: enabled_2
          };
        });
        setGlobalConfig({
          ...getGlobalConfig(),
          speculationEnabled: enabled_2
        });
        logEvent("tengu_speculation_setting_changed", {
          enabled: enabled_2
        });
      }
    }] : [],
    ...isFileCheckpointingAvailable ? [{
      id: "fileCheckpointingEnabled",
      label: "Rewind code (checkpoints)",
      value: globalConfig.fileCheckpointingEnabled,
      type: "boolean",
      onChange(enabled_3) {
        saveGlobalConfig((current_2) => ({
          ...current_2,
          fileCheckpointingEnabled: enabled_3
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          fileCheckpointingEnabled: enabled_3
        });
        logEvent("tengu_file_history_snapshots_setting_changed", {
          enabled: enabled_3
        });
      }
    }] : [],
    {
      id: "verbose",
      label: "Verbose output",
      value: verbose,
      type: "boolean",
      onChange: onChangeVerbose
    },
    {
      id: "terminalProgressBarEnabled",
      label: "Terminal progress bar",
      value: globalConfig.terminalProgressBarEnabled,
      type: "boolean",
      onChange(terminalProgressBarEnabled) {
        saveGlobalConfig((current_3) => ({
          ...current_3,
          terminalProgressBarEnabled
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          terminalProgressBarEnabled
        });
        logEvent("tengu_terminal_progress_bar_setting_changed", {
          enabled: terminalProgressBarEnabled
        });
      }
    },
    ...getFeatureValue_CACHED_MAY_BE_STALE("tengu_terminal_sidebar", false) ? [{
      id: "showStatusInTerminalTab",
      label: "Show status in terminal tab",
      value: globalConfig.showStatusInTerminalTab ?? false,
      type: "boolean",
      onChange(showStatusInTerminalTab) {
        saveGlobalConfig((current_4) => ({
          ...current_4,
          showStatusInTerminalTab
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          showStatusInTerminalTab
        });
        logEvent("tengu_terminal_tab_status_setting_changed", {
          enabled: showStatusInTerminalTab
        });
      }
    }] : [],
    {
      id: "showTurnDuration",
      label: "Show turn duration",
      value: globalConfig.showTurnDuration,
      type: "boolean",
      onChange(showTurnDuration) {
        saveGlobalConfig((current_5) => ({
          ...current_5,
          showTurnDuration
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          showTurnDuration
        });
        logEvent("tengu_show_turn_duration_setting_changed", {
          enabled: showTurnDuration
        });
      }
    },
    {
      id: "defaultPermissionMode",
      label: "Default permission mode",
      value: settingsData?.permissions?.defaultMode || "default",
      options: (() => {
        const priorityOrder = ["default", "plan"];
        const allModes = false ? PERMISSION_MODES : EXTERNAL_PERMISSION_MODES;
        const excluded = ["bypassPermissions"];
        if (false) {
          excluded.push("auto");
        }
        return [...priorityOrder, ...allModes.filter((m) => !priorityOrder.includes(m) && !excluded.includes(m))];
      })(),
      type: "enum",
      onChange(mode) {
        const parsedMode = permissionModeFromString(mode);
        const validatedMode = isExternalPermissionMode(parsedMode) ? toExternalPermissionMode(parsedMode) : parsedMode;
        const result = updateSettingsForSource("userSettings", {
          permissions: {
            ...settingsData?.permissions,
            defaultMode: validatedMode
          }
        });
        if (result.error) {
          logError(result.error);
          return;
        }
        setSettingsData((prev_12) => ({
          ...prev_12,
          permissions: {
            ...prev_12?.permissions,
            defaultMode: validatedMode
          }
        }));
        setChanges((prev_13) => ({
          ...prev_13,
          defaultPermissionMode: mode
        }));
        logEvent("tengu_config_changed", {
          setting: "defaultPermissionMode",
          value: mode
        });
      }
    },
    ...false ? [{
      id: "useAutoModeDuringPlan",
      label: "Use auto mode during plan",
      value: settingsData?.useAutoModeDuringPlan ?? true,
      type: "boolean",
      onChange(useAutoModeDuringPlan) {
        updateSettingsForSource("userSettings", {
          useAutoModeDuringPlan
        });
        setSettingsData((prev_14) => ({
          ...prev_14,
          useAutoModeDuringPlan
        }));
        setAppState((prev_15) => {
          const next = transitionPlanAutoMode(prev_15.toolPermissionContext);
          if (next === prev_15.toolPermissionContext) return prev_15;
          return {
            ...prev_15,
            toolPermissionContext: next
          };
        });
        setChanges((prev_16) => ({
          ...prev_16,
          "Use auto mode during plan": useAutoModeDuringPlan
        }));
      }
    }] : [],
    {
      id: "respectGitignore",
      label: "Respect .gitignore in file picker",
      value: globalConfig.respectGitignore,
      type: "boolean",
      onChange(respectGitignore) {
        saveGlobalConfig((current_6) => ({
          ...current_6,
          respectGitignore
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          respectGitignore
        });
        logEvent("tengu_respect_gitignore_setting_changed", {
          enabled: respectGitignore
        });
      }
    },
    {
      id: "copyFullResponse",
      label: "Always copy full response (skip /copy picker)",
      value: globalConfig.copyFullResponse,
      type: "boolean",
      onChange(copyFullResponse) {
        saveGlobalConfig((current_7) => ({
          ...current_7,
          copyFullResponse
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          copyFullResponse
        });
        logEvent("tengu_config_changed", {
          setting: "copyFullResponse",
          value: String(copyFullResponse)
        });
      }
    },
    // Copy-on-select is only meaningful with in-app selection (fullscreen
    // alt-screen mode). In inline mode the terminal emulator owns selection.
    ...isFullscreenEnvEnabled() ? [{
      id: "copyOnSelect",
      label: "Copy on select",
      value: globalConfig.copyOnSelect ?? true,
      type: "boolean",
      onChange(copyOnSelect) {
        saveGlobalConfig((current_8) => ({
          ...current_8,
          copyOnSelect
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          copyOnSelect
        });
        logEvent("tengu_config_changed", {
          setting: "copyOnSelect",
          value: String(copyOnSelect)
        });
      }
    }] : [],
    // autoUpdates setting is hidden - use DISABLE_AUTOUPDATER env var to control
    autoUpdaterDisabledReason ? {
      id: "autoUpdatesChannel",
      label: "Auto-update channel",
      value: "disabled",
      type: "managedEnum",
      onChange() {
      }
    } : {
      id: "autoUpdatesChannel",
      label: "Auto-update channel",
      value: settingsData?.autoUpdatesChannel ?? "latest",
      type: "managedEnum",
      onChange() {
      }
    },
    {
      id: "theme",
      label: "Theme",
      value: themeSetting,
      type: "managedEnum",
      onChange: setTheme
    },
    {
      id: "notifChannel",
      label: false ? "Local notifications" : "Notifications",
      value: globalConfig.preferredNotifChannel,
      options: ["auto", "iterm2", "terminal_bell", "iterm2_with_bell", "kitty", "ghostty", "notifications_disabled"],
      type: "enum",
      onChange(notifChannel) {
        saveGlobalConfig((current_9) => ({
          ...current_9,
          preferredNotifChannel: notifChannel
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          preferredNotifChannel: notifChannel
        });
      }
    },
    ...false ? [{
      id: "taskCompleteNotifEnabled",
      label: "Push when idle",
      value: globalConfig.taskCompleteNotifEnabled ?? false,
      type: "boolean",
      onChange(taskCompleteNotifEnabled) {
        saveGlobalConfig((current_10) => ({
          ...current_10,
          taskCompleteNotifEnabled
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          taskCompleteNotifEnabled
        });
      }
    }, {
      id: "inputNeededNotifEnabled",
      label: "Push when input needed",
      value: globalConfig.inputNeededNotifEnabled ?? false,
      type: "boolean",
      onChange(inputNeededNotifEnabled) {
        saveGlobalConfig((current_11) => ({
          ...current_11,
          inputNeededNotifEnabled
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          inputNeededNotifEnabled
        });
      }
    }, {
      id: "agentPushNotifEnabled",
      label: "Push when Claude decides",
      value: globalConfig.agentPushNotifEnabled ?? false,
      type: "boolean",
      onChange(agentPushNotifEnabled) {
        saveGlobalConfig((current_12) => ({
          ...current_12,
          agentPushNotifEnabled
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          agentPushNotifEnabled
        });
      }
    }] : [],
    {
      id: "outputStyle",
      label: "Output style",
      value: currentOutputStyle,
      type: "managedEnum",
      onChange: () => {
      }
      // handled by OutputStylePicker submenu
    },
    ...showDefaultViewPicker ? [{
      id: "defaultView",
      label: "What you see by default",
      // 'default' means the setting is unset — currently resolves to
      // transcript (main.tsx falls through when defaultView !== 'chat').
      // String() narrows the conditional-schema-spread union to string.
      value: settingsData?.defaultView === void 0 ? "default" : String(settingsData.defaultView),
      options: ["transcript", "chat", "default"],
      type: "enum",
      onChange(selected) {
        const defaultView = selected === "default" ? void 0 : selected;
        updateSettingsForSource("localSettings", {
          defaultView
        });
        setSettingsData((prev_17) => ({
          ...prev_17,
          defaultView
        }));
        const nextBrief = defaultView === "chat";
        setAppState((prev_18) => {
          if (prev_18.isBriefOnly === nextBrief) return prev_18;
          return {
            ...prev_18,
            isBriefOnly: nextBrief
          };
        });
        setUserMsgOptIn(nextBrief);
        setChanges((prev_19) => ({
          ...prev_19,
          "Default view": selected
        }));
        logEvent("tengu_default_view_setting_changed", {
          value: defaultView ?? "unset"
        });
      }
    }] : [],
    {
      id: "language",
      label: "Language",
      value: currentLanguage ?? "Default (English)",
      type: "managedEnum",
      onChange: () => {
      }
      // handled by LanguagePicker submenu
    },
    {
      id: "editorMode",
      label: "Editor mode",
      // Convert 'emacs' to 'normal' for backward compatibility
      value: globalConfig.editorMode === "emacs" ? "normal" : globalConfig.editorMode || "normal",
      options: ["normal", "vim"],
      type: "enum",
      onChange(value_1) {
        saveGlobalConfig((current_13) => ({
          ...current_13,
          editorMode: value_1
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          editorMode: value_1
        });
        logEvent("tengu_editor_mode_changed", {
          mode: value_1,
          source: "config_panel"
        });
      }
    },
    {
      id: "prStatusFooterEnabled",
      label: "Show PR status footer",
      value: globalConfig.prStatusFooterEnabled ?? true,
      type: "boolean",
      onChange(enabled_4) {
        saveGlobalConfig((current_14) => {
          if (current_14.prStatusFooterEnabled === enabled_4) return current_14;
          return {
            ...current_14,
            prStatusFooterEnabled: enabled_4
          };
        });
        setGlobalConfig({
          ...getGlobalConfig(),
          prStatusFooterEnabled: enabled_4
        });
        logEvent("tengu_pr_status_footer_setting_changed", {
          enabled: enabled_4
        });
      }
    },
    {
      id: "model",
      label: "Model",
      value: mainLoopModel === null ? "Default (recommended)" : mainLoopModel,
      type: "managedEnum",
      onChange: onChangeMainModelConfig
    },
    ...isConnectedToIde ? [{
      id: "diffTool",
      label: "Diff tool",
      value: globalConfig.diffTool ?? "auto",
      options: ["terminal", "auto"],
      type: "enum",
      onChange(diffTool) {
        saveGlobalConfig((current_15) => ({
          ...current_15,
          diffTool
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          diffTool
        });
        logEvent("tengu_diff_tool_changed", {
          tool: diffTool,
          source: "config_panel"
        });
      }
    }] : [],
    ...!isSupportedTerminal() ? [{
      id: "autoConnectIde",
      label: "Auto-connect to IDE (external terminal)",
      value: globalConfig.autoConnectIde ?? false,
      type: "boolean",
      onChange(autoConnectIde) {
        saveGlobalConfig((current_16) => ({
          ...current_16,
          autoConnectIde
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          autoConnectIde
        });
        logEvent("tengu_auto_connect_ide_changed", {
          enabled: autoConnectIde,
          source: "config_panel"
        });
      }
    }] : [],
    ...isSupportedTerminal() ? [{
      id: "autoInstallIdeExtension",
      label: "Auto-install IDE extension",
      value: globalConfig.autoInstallIdeExtension ?? true,
      type: "boolean",
      onChange(autoInstallIdeExtension) {
        saveGlobalConfig((current_17) => ({
          ...current_17,
          autoInstallIdeExtension
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          autoInstallIdeExtension
        });
        logEvent("tengu_auto_install_ide_extension_changed", {
          enabled: autoInstallIdeExtension,
          source: "config_panel"
        });
      }
    }] : [],
    {
      id: "claudeInChromeDefaultEnabled",
      label: "Claude in Chrome enabled by default",
      value: globalConfig.claudeInChromeDefaultEnabled ?? true,
      type: "boolean",
      onChange(enabled_5) {
        saveGlobalConfig((current_18) => ({
          ...current_18,
          claudeInChromeDefaultEnabled: enabled_5
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          claudeInChromeDefaultEnabled: enabled_5
        });
        logEvent("tengu_claude_in_chrome_setting_changed", {
          enabled: enabled_5
        });
      }
    },
    // Teammate mode (only shown when agent swarms are enabled)
    ...isAgentSwarmsEnabled() ? (() => {
      const cliOverride = getCliTeammateModeOverride();
      const label = cliOverride ? `Teammate mode [overridden: ${cliOverride}]` : "Teammate mode";
      return [{
        id: "teammateMode",
        label,
        value: globalConfig.teammateMode ?? "auto",
        options: ["auto", "tmux", "in-process"],
        type: "enum",
        onChange(mode_0) {
          if (mode_0 !== "auto" && mode_0 !== "tmux" && mode_0 !== "in-process") {
            return;
          }
          clearCliTeammateModeOverride(mode_0);
          saveGlobalConfig((current_19) => ({
            ...current_19,
            teammateMode: mode_0
          }));
          setGlobalConfig({
            ...getGlobalConfig(),
            teammateMode: mode_0
          });
          logEvent("tengu_teammate_mode_changed", {
            mode: mode_0
          });
        }
      }, {
        id: "teammateDefaultModel",
        label: "Default teammate model",
        value: teammateModelDisplayString(globalConfig.teammateDefaultModel),
        type: "managedEnum",
        onChange() {
        }
      }];
    })() : [],
    // Remote at startup toggle — gated on build flag + GrowthBook + policy
    ...false ? [{
      id: "remoteControlAtStartup",
      label: "Enable Remote Control for all sessions",
      value: globalConfig.remoteControlAtStartup === void 0 ? "default" : String(globalConfig.remoteControlAtStartup),
      options: ["true", "false", "default"],
      type: "enum",
      onChange(selected_0) {
        if (selected_0 === "default") {
          saveGlobalConfig((current_20) => {
            if (current_20.remoteControlAtStartup === void 0) return current_20;
            const next_0 = {
              ...current_20
            };
            delete next_0.remoteControlAtStartup;
            return next_0;
          });
          setGlobalConfig({
            ...getGlobalConfig(),
            remoteControlAtStartup: void 0
          });
        } else {
          const enabled_6 = selected_0 === "true";
          saveGlobalConfig((current_21) => {
            if (current_21.remoteControlAtStartup === enabled_6) return current_21;
            return {
              ...current_21,
              remoteControlAtStartup: enabled_6
            };
          });
          setGlobalConfig({
            ...getGlobalConfig(),
            remoteControlAtStartup: enabled_6
          });
        }
        const resolved = getRemoteControlAtStartup();
        setAppState((prev_20) => {
          if (prev_20.replBridgeEnabled === resolved && !prev_20.replBridgeOutboundOnly) return prev_20;
          return {
            ...prev_20,
            replBridgeEnabled: resolved,
            replBridgeOutboundOnly: false
          };
        });
      }
    }] : [],
    ...shouldShowExternalIncludesToggle ? [{
      id: "showExternalIncludesDialog",
      label: "External CLAUDE.md includes",
      value: (() => {
        const projectConfig = getCurrentProjectConfig();
        if (projectConfig.hasClaudeMdExternalIncludesApproved) {
          return "true";
        } else {
          return "false";
        }
      })(),
      type: "managedEnum",
      onChange() {
      }
    }] : [],
    ...process.env.ANTHROPIC_API_KEY && !isRunningOnHomespace() ? [{
      id: "apiKey",
      label: /* @__PURE__ */ jsxs(Text, { children: [
        "Use custom API key:",
        " ",
        /* @__PURE__ */ jsx(Text, { bold: true, children: normalizeApiKeyForConfig(process.env.ANTHROPIC_API_KEY) })
      ] }),
      searchText: "Use custom API key",
      value: Boolean(process.env.ANTHROPIC_API_KEY && globalConfig.customApiKeyResponses?.approved?.includes(normalizeApiKeyForConfig(process.env.ANTHROPIC_API_KEY))),
      type: "boolean",
      onChange(useCustomKey) {
        saveGlobalConfig((current_22) => {
          const updated = {
            ...current_22
          };
          if (!updated.customApiKeyResponses) {
            updated.customApiKeyResponses = {
              approved: [],
              rejected: []
            };
          }
          if (!updated.customApiKeyResponses.approved) {
            updated.customApiKeyResponses = {
              ...updated.customApiKeyResponses,
              approved: []
            };
          }
          if (!updated.customApiKeyResponses.rejected) {
            updated.customApiKeyResponses = {
              ...updated.customApiKeyResponses,
              rejected: []
            };
          }
          if (process.env.ANTHROPIC_API_KEY) {
            const truncatedKey = normalizeApiKeyForConfig(process.env.ANTHROPIC_API_KEY);
            if (useCustomKey) {
              updated.customApiKeyResponses = {
                ...updated.customApiKeyResponses,
                approved: [...(updated.customApiKeyResponses.approved ?? []).filter((k) => k !== truncatedKey), truncatedKey],
                rejected: (updated.customApiKeyResponses.rejected ?? []).filter((k_0) => k_0 !== truncatedKey)
              };
            } else {
              updated.customApiKeyResponses = {
                ...updated.customApiKeyResponses,
                approved: (updated.customApiKeyResponses.approved ?? []).filter((k_1) => k_1 !== truncatedKey),
                rejected: [...(updated.customApiKeyResponses.rejected ?? []).filter((k_2) => k_2 !== truncatedKey), truncatedKey]
              };
            }
          }
          return updated;
        });
        setGlobalConfig(getGlobalConfig());
      }
    }] : []
  ];
  const filteredSettingsItems = React.useMemo(() => {
    if (!searchQuery) return settingsItems;
    const lowerQuery = searchQuery.toLowerCase();
    return settingsItems.filter((setting) => {
      if (setting.id.toLowerCase().includes(lowerQuery)) return true;
      const searchableText = "searchText" in setting ? setting.searchText : setting.label;
      return searchableText.toLowerCase().includes(lowerQuery);
    });
  }, [settingsItems, searchQuery]);
  React.useEffect(() => {
    if (selectedIndex >= filteredSettingsItems.length) {
      const newIndex = Math.max(0, filteredSettingsItems.length - 1);
      setSelectedIndex(newIndex);
      setScrollOffset(Math.max(0, newIndex - maxVisible + 1));
      return;
    }
    setScrollOffset((prev_21) => {
      if (selectedIndex < prev_21) return selectedIndex;
      if (selectedIndex >= prev_21 + maxVisible) return selectedIndex - maxVisible + 1;
      return prev_21;
    });
  }, [filteredSettingsItems.length, selectedIndex, maxVisible]);
  const adjustScrollOffset = useCallback((newIndex_0) => {
    setScrollOffset((prev_22) => {
      if (newIndex_0 < prev_22) return newIndex_0;
      if (newIndex_0 >= prev_22 + maxVisible) return newIndex_0 - maxVisible + 1;
      return prev_22;
    });
  }, [maxVisible]);
  const handleSaveAndClose = useCallback(() => {
    if (showSubmenu !== null) {
      return;
    }
    const formattedChanges = Object.entries(changes).map(([key, value_2]) => {
      logEvent("tengu_config_changed", {
        key,
        value: value_2
      });
      return `Set ${key} to ${chalk.bold(value_2)}`;
    });
    const effectiveApiKey = isRunningOnHomespace() ? void 0 : process.env.ANTHROPIC_API_KEY;
    const initialUsingCustomKey = Boolean(effectiveApiKey && initialConfig.current.customApiKeyResponses?.approved?.includes(normalizeApiKeyForConfig(effectiveApiKey)));
    const currentUsingCustomKey = Boolean(effectiveApiKey && globalConfig.customApiKeyResponses?.approved?.includes(normalizeApiKeyForConfig(effectiveApiKey)));
    if (initialUsingCustomKey !== currentUsingCustomKey) {
      formattedChanges.push(`${currentUsingCustomKey ? "Enabled" : "Disabled"} custom API key`);
      logEvent("tengu_config_changed", {
        key: "env.ANTHROPIC_API_KEY",
        value: currentUsingCustomKey
      });
    }
    if (globalConfig.theme !== initialConfig.current.theme) {
      formattedChanges.push(`Set theme to ${chalk.bold(globalConfig.theme)}`);
    }
    if (globalConfig.preferredNotifChannel !== initialConfig.current.preferredNotifChannel) {
      formattedChanges.push(`Set notifications to ${chalk.bold(globalConfig.preferredNotifChannel)}`);
    }
    if (currentOutputStyle !== initialOutputStyle.current) {
      formattedChanges.push(`Set output style to ${chalk.bold(currentOutputStyle)}`);
    }
    if (currentLanguage !== initialLanguage.current) {
      formattedChanges.push(`Set response language to ${chalk.bold(currentLanguage ?? "Default (English)")}`);
    }
    if (globalConfig.editorMode !== initialConfig.current.editorMode) {
      formattedChanges.push(`Set editor mode to ${chalk.bold(globalConfig.editorMode || "emacs")}`);
    }
    if (globalConfig.diffTool !== initialConfig.current.diffTool) {
      formattedChanges.push(`Set diff tool to ${chalk.bold(globalConfig.diffTool)}`);
    }
    if (globalConfig.autoConnectIde !== initialConfig.current.autoConnectIde) {
      formattedChanges.push(`${globalConfig.autoConnectIde ? "Enabled" : "Disabled"} auto-connect to IDE`);
    }
    if (globalConfig.autoInstallIdeExtension !== initialConfig.current.autoInstallIdeExtension) {
      formattedChanges.push(`${globalConfig.autoInstallIdeExtension ? "Enabled" : "Disabled"} auto-install IDE extension`);
    }
    if (globalConfig.autoCompactEnabled !== initialConfig.current.autoCompactEnabled) {
      formattedChanges.push(`${globalConfig.autoCompactEnabled ? "Enabled" : "Disabled"} auto-compact`);
    }
    if (globalConfig.respectGitignore !== initialConfig.current.respectGitignore) {
      formattedChanges.push(`${globalConfig.respectGitignore ? "Enabled" : "Disabled"} respect .gitignore in file picker`);
    }
    if (globalConfig.copyFullResponse !== initialConfig.current.copyFullResponse) {
      formattedChanges.push(`${globalConfig.copyFullResponse ? "Enabled" : "Disabled"} always copy full response`);
    }
    if (globalConfig.copyOnSelect !== initialConfig.current.copyOnSelect) {
      formattedChanges.push(`${globalConfig.copyOnSelect ? "Enabled" : "Disabled"} copy on select`);
    }
    if (globalConfig.terminalProgressBarEnabled !== initialConfig.current.terminalProgressBarEnabled) {
      formattedChanges.push(`${globalConfig.terminalProgressBarEnabled ? "Enabled" : "Disabled"} terminal progress bar`);
    }
    if (globalConfig.showStatusInTerminalTab !== initialConfig.current.showStatusInTerminalTab) {
      formattedChanges.push(`${globalConfig.showStatusInTerminalTab ? "Enabled" : "Disabled"} terminal tab status`);
    }
    if (globalConfig.showTurnDuration !== initialConfig.current.showTurnDuration) {
      formattedChanges.push(`${globalConfig.showTurnDuration ? "Enabled" : "Disabled"} turn duration`);
    }
    if (globalConfig.remoteControlAtStartup !== initialConfig.current.remoteControlAtStartup) {
      const remoteLabel = globalConfig.remoteControlAtStartup === void 0 ? "Reset Remote Control to default" : `${globalConfig.remoteControlAtStartup ? "Enabled" : "Disabled"} Remote Control for all sessions`;
      formattedChanges.push(remoteLabel);
    }
    if (settingsData?.autoUpdatesChannel !== initialSettingsData.current?.autoUpdatesChannel) {
      formattedChanges.push(`Set auto-update channel to ${chalk.bold(settingsData?.autoUpdatesChannel ?? "latest")}`);
    }
    if (formattedChanges.length > 0) {
      onClose(formattedChanges.join("\n"));
    } else {
      onClose("Config dialog dismissed", {
        display: "system"
      });
    }
  }, [showSubmenu, changes, globalConfig, mainLoopModel, currentOutputStyle, currentLanguage, settingsData?.autoUpdatesChannel, isFastModeEnabled() ? settingsData?.fastMode : void 0, onClose]);
  const revertChanges = useCallback(() => {
    if (themeSetting !== initialThemeSetting.current) {
      setTheme(initialThemeSetting.current);
    }
    saveGlobalConfig(() => initialConfig.current);
    const il = initialLocalSettings;
    updateSettingsForSource("localSettings", {
      spinnerTipsEnabled: il?.spinnerTipsEnabled,
      prefersReducedMotion: il?.prefersReducedMotion,
      defaultView: il?.defaultView,
      outputStyle: il?.outputStyle
    });
    const iu = initialUserSettings;
    updateSettingsForSource("userSettings", {
      alwaysThinkingEnabled: iu?.alwaysThinkingEnabled,
      fastMode: iu?.fastMode,
      promptSuggestionEnabled: iu?.promptSuggestionEnabled,
      autoUpdatesChannel: iu?.autoUpdatesChannel,
      minimumVersion: iu?.minimumVersion,
      language: iu?.language,
      ...false ? {
        useAutoModeDuringPlan: iu?.useAutoModeDuringPlan
      } : {},
      // ThemePicker's Ctrl+T writes this key directly — include it so the
      // disk state reverts along with the in-memory AppState.settings restore.
      syntaxHighlightingDisabled: iu?.syntaxHighlightingDisabled,
      // permissions: the defaultMode onChange (above) spreads the MERGED
      // settingsData.permissions into userSettings — project/policy allow/deny
      // arrays can leak to disk. Spread the full initial snapshot so the
      // mergeWith array-customizer (settings.ts:375) replaces leaked arrays.
      // Explicitly include defaultMode so undefined triggers the customizer's
      // delete path even when iu.permissions lacks that key.
      permissions: iu?.permissions === void 0 ? void 0 : {
        ...iu.permissions,
        defaultMode: iu.permissions.defaultMode
      }
    });
    const ia = initialAppState;
    setAppState((prev_23) => ({
      ...prev_23,
      mainLoopModel: ia.mainLoopModel,
      mainLoopModelForSession: ia.mainLoopModelForSession,
      verbose: ia.verbose,
      thinkingEnabled: ia.thinkingEnabled,
      fastMode: ia.fastMode,
      promptSuggestionEnabled: ia.promptSuggestionEnabled,
      isBriefOnly: ia.isBriefOnly,
      replBridgeEnabled: ia.replBridgeEnabled,
      replBridgeOutboundOnly: ia.replBridgeOutboundOnly,
      settings: ia.settings,
      // Reconcile auto-mode state after useAutoModeDuringPlan revert above —
      // the onChange handler may have activated/deactivated auto mid-plan.
      toolPermissionContext: transitionPlanAutoMode(prev_23.toolPermissionContext)
    }));
    if (getUserMsgOptIn() !== initialUserMsgOptIn) {
      setUserMsgOptIn(initialUserMsgOptIn);
    }
  }, [themeSetting, setTheme, initialLocalSettings, initialUserSettings, initialAppState, initialUserMsgOptIn, setAppState]);
  const handleEscape = useCallback(() => {
    if (showSubmenu !== null) {
      return;
    }
    if (isDirty.current) {
      revertChanges();
    }
    onClose("Config dialog dismissed", {
      display: "system"
    });
  }, [showSubmenu, revertChanges, onClose]);
  useKeybinding("confirm:no", handleEscape, {
    context: "Settings",
    isActive: showSubmenu === null && !isSearchMode && !headerFocused
  });
  useKeybinding("settings:close", handleSaveAndClose, {
    context: "Settings",
    isActive: showSubmenu === null && !isSearchMode && !headerFocused
  });
  const toggleSetting = useCallback(() => {
    const setting_0 = filteredSettingsItems[selectedIndex];
    if (!setting_0 || !setting_0.onChange) {
      return;
    }
    if (setting_0.type === "boolean") {
      isDirty.current = true;
      setting_0.onChange(!setting_0.value);
      if (setting_0.id === "thinkingEnabled") {
        const newValue = !setting_0.value;
        const backToInitial = newValue === initialThinkingEnabled.current;
        if (backToInitial) {
          setShowThinkingWarning(false);
        } else if (context.messages.some((m_0) => m_0.type === "assistant")) {
          setShowThinkingWarning(true);
        }
      }
      return;
    }
    if (setting_0.id === "theme" || setting_0.id === "model" || setting_0.id === "teammateDefaultModel" || setting_0.id === "showExternalIncludesDialog" || setting_0.id === "outputStyle" || setting_0.id === "language") {
      switch (setting_0.id) {
        case "theme":
          setShowSubmenu("Theme");
          setTabsHidden(true);
          return;
        case "model":
          setShowSubmenu("Model");
          setTabsHidden(true);
          return;
        case "teammateDefaultModel":
          setShowSubmenu("TeammateModel");
          setTabsHidden(true);
          return;
        case "showExternalIncludesDialog":
          setShowSubmenu("ExternalIncludes");
          setTabsHidden(true);
          return;
        case "outputStyle":
          setShowSubmenu("OutputStyle");
          setTabsHidden(true);
          return;
        case "language":
          setShowSubmenu("Language");
          setTabsHidden(true);
          return;
      }
    }
    if (setting_0.id === "autoUpdatesChannel") {
      if (autoUpdaterDisabledReason) {
        setShowSubmenu("EnableAutoUpdates");
        setTabsHidden(true);
        return;
      }
      const currentChannel = settingsData?.autoUpdatesChannel ?? "latest";
      if (currentChannel === "latest") {
        setShowSubmenu("ChannelDowngrade");
        setTabsHidden(true);
      } else {
        isDirty.current = true;
        updateSettingsForSource("userSettings", {
          autoUpdatesChannel: "latest",
          minimumVersion: void 0
        });
        setSettingsData((prev_24) => ({
          ...prev_24,
          autoUpdatesChannel: "latest",
          minimumVersion: void 0
        }));
        logEvent("tengu_autoupdate_channel_changed", {
          channel: "latest"
        });
      }
      return;
    }
    if (setting_0.type === "enum") {
      isDirty.current = true;
      const currentIndex = setting_0.options.indexOf(setting_0.value);
      const nextIndex = (currentIndex + 1) % setting_0.options.length;
      setting_0.onChange(setting_0.options[nextIndex]);
      return;
    }
  }, [autoUpdaterDisabledReason, filteredSettingsItems, selectedIndex, settingsData?.autoUpdatesChannel, setTabsHidden]);
  const moveSelection = (delta) => {
    setShowThinkingWarning(false);
    const newIndex_1 = Math.max(0, Math.min(filteredSettingsItems.length - 1, selectedIndex + delta));
    setSelectedIndex(newIndex_1);
    adjustScrollOffset(newIndex_1);
  };
  useKeybindings({
    "select:previous": () => {
      if (selectedIndex === 0) {
        setShowThinkingWarning(false);
        setIsSearchMode(true);
        setScrollOffset(0);
      } else {
        moveSelection(-1);
      }
    },
    "select:next": () => moveSelection(1),
    // Wheel. ScrollKeybindingHandler's scroll:line* returns false (not
    // consumed) when the ScrollBox content fits — which it always does
    // here because the list is paginated (slice). The event falls through
    // to this handler which navigates the list, clamping at boundaries.
    "scroll:lineUp": () => moveSelection(-1),
    "scroll:lineDown": () => moveSelection(1),
    "select:accept": toggleSetting,
    "settings:search": () => {
      setIsSearchMode(true);
      setSearchQuery("");
    }
  }, {
    context: "Settings",
    isActive: showSubmenu === null && !isSearchMode && !headerFocused
  });
  const handleKeyDown = useCallback((e) => {
    if (showSubmenu !== null) return;
    if (headerFocused) return;
    if (isSearchMode) {
      if (e.key === "escape") {
        e.preventDefault();
        if (searchQuery.length > 0) {
          setSearchQuery("");
        } else {
          setIsSearchMode(false);
        }
        return;
      }
      if (e.key === "return" || e.key === "down" || e.key === "wheeldown") {
        e.preventDefault();
        setIsSearchMode(false);
        setSelectedIndex(0);
        setScrollOffset(0);
      }
      return;
    }
    if (e.key === "left" || e.key === "right" || e.key === "tab") {
      e.preventDefault();
      toggleSetting();
      return;
    }
    if (e.ctrl || e.meta) return;
    if (e.key === "j" || e.key === "k" || e.key === "/") return;
    if (e.key.length === 1 && e.key !== " ") {
      e.preventDefault();
      setIsSearchMode(true);
      setSearchQuery(e.key);
    }
  }, [showSubmenu, headerFocused, isSearchMode, searchQuery, setSearchQuery, toggleSetting]);
  return /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: "100%", tabIndex: 0, autoFocus: true, onKeyDown: handleKeyDown, children: showSubmenu === "Theme" ? /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      ThemePicker,
      {
        onThemeSelect: (setting_1) => {
          isDirty.current = true;
          setTheme(setting_1);
          setShowSubmenu(null);
          setTabsHidden(false);
        },
        onCancel: () => {
          setShowSubmenu(null);
          setTabsHidden(false);
        },
        hideEscToCancel: true,
        skipExitHandling: true
      }
    ),
    /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: "select" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "cancel" })
    ] }) }) })
  ] }) : showSubmenu === "Model" ? /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(ModelPicker, { initial: mainLoopModel, onSelect: (model_0, _effort) => {
      isDirty.current = true;
      onChangeMainModelConfig(model_0);
      setShowSubmenu(null);
      setTabsHidden(false);
    }, onCancel: () => {
      setShowSubmenu(null);
      setTabsHidden(false);
    }, showFastModeNotice: isFastModeEnabled() ? isFastMode && isFastModeSupportedByModel(mainLoopModel) && isFastModeAvailable() : false }),
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: "confirm" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "cancel" })
    ] }) })
  ] }) : showSubmenu === "TeammateModel" ? /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(ModelPicker, { initial: globalConfig.teammateDefaultModel ?? null, skipSettingsWrite: true, headerText: "Default model for newly spawned teammates. The leader can override via the tool call's model parameter.", onSelect: (model_1, _effort_0) => {
      setShowSubmenu(null);
      setTabsHidden(false);
      if (globalConfig.teammateDefaultModel === void 0 && model_1 === null) {
        return;
      }
      isDirty.current = true;
      saveGlobalConfig((current_23) => current_23.teammateDefaultModel === model_1 ? current_23 : {
        ...current_23,
        teammateDefaultModel: model_1
      });
      setGlobalConfig({
        ...getGlobalConfig(),
        teammateDefaultModel: model_1
      });
      setChanges((prev_25) => ({
        ...prev_25,
        teammateDefaultModel: teammateModelDisplayString(model_1)
      }));
      logEvent("tengu_teammate_default_model_changed", {
        model: model_1
      });
    }, onCancel: () => {
      setShowSubmenu(null);
      setTabsHidden(false);
    } }),
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: "confirm" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "cancel" })
    ] }) })
  ] }) : showSubmenu === "ExternalIncludes" ? /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(ClaudeMdExternalIncludesDialog, { onDone: () => {
      setShowSubmenu(null);
      setTabsHidden(false);
    }, externalIncludes: getExternalClaudeMdIncludes(memoryFiles) }),
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: "confirm" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "disable external includes" })
    ] }) })
  ] }) : showSubmenu === "OutputStyle" ? /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(OutputStylePicker, { initialStyle: currentOutputStyle, onComplete: (style) => {
      isDirty.current = true;
      setCurrentOutputStyle(style ?? DEFAULT_OUTPUT_STYLE_NAME);
      setShowSubmenu(null);
      setTabsHidden(false);
      updateSettingsForSource("localSettings", {
        outputStyle: style
      });
      void logEvent("tengu_output_style_changed", {
        style: style ?? DEFAULT_OUTPUT_STYLE_NAME,
        source: "config_panel",
        settings_source: "localSettings"
      });
    }, onCancel: () => {
      setShowSubmenu(null);
      setTabsHidden(false);
    } }),
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: "confirm" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Confirmation", fallback: "Esc", description: "cancel" })
    ] }) })
  ] }) : showSubmenu === "Language" ? /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(LanguagePicker, { initialLanguage: currentLanguage, onComplete: (language) => {
      isDirty.current = true;
      setCurrentLanguage(language);
      setShowSubmenu(null);
      setTabsHidden(false);
      updateSettingsForSource("userSettings", {
        language
      });
      void logEvent("tengu_language_changed", {
        language: language ?? "default",
        source: "config_panel"
      });
    }, onCancel: () => {
      setShowSubmenu(null);
      setTabsHidden(false);
    } }),
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: "confirm" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Settings", fallback: "Esc", description: "cancel" })
    ] }) })
  ] }) : showSubmenu === "EnableAutoUpdates" ? /* @__PURE__ */ jsx(Dialog, { title: "Enable Auto-Updates", onCancel: () => {
    setShowSubmenu(null);
    setTabsHidden(false);
  }, hideBorder: true, hideInputGuide: true, children: autoUpdaterDisabledReason?.type !== "config" ? /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Text, { children: autoUpdaterDisabledReason?.type === "env" ? "Auto-updates are controlled by an environment variable and cannot be changed here." : "Auto-updates are disabled in development builds." }),
    autoUpdaterDisabledReason?.type === "env" && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "Unset ",
      autoUpdaterDisabledReason.envVar,
      " to re-enable auto-updates."
    ] })
  ] }) : /* @__PURE__ */ jsx(Select, { options: [{
    label: "Enable with latest channel",
    value: "latest"
  }, {
    label: "Enable with stable channel",
    value: "stable"
  }], onChange: (channel) => {
    isDirty.current = true;
    setShowSubmenu(null);
    setTabsHidden(false);
    saveGlobalConfig((current_24) => ({
      ...current_24,
      autoUpdates: true
    }));
    setGlobalConfig({
      ...getGlobalConfig(),
      autoUpdates: true
    });
    updateSettingsForSource("userSettings", {
      autoUpdatesChannel: channel,
      minimumVersion: void 0
    });
    setSettingsData((prev_26) => ({
      ...prev_26,
      autoUpdatesChannel: channel,
      minimumVersion: void 0
    }));
    logEvent("tengu_autoupdate_enabled", {
      channel
    });
  } }) }) : showSubmenu === "ChannelDowngrade" ? /* @__PURE__ */ jsx(ChannelDowngradeDialog, { currentVersion: "0.0.0-dev", onChoice: (choice) => {
    setShowSubmenu(null);
    setTabsHidden(false);
    if (choice === "cancel") {
      return;
    }
    isDirty.current = true;
    const newSettings = {
      autoUpdatesChannel: "stable"
    };
    if (choice === "stay") {
      newSettings.minimumVersion = "0.0.0-dev";
    }
    updateSettingsForSource("userSettings", newSettings);
    setSettingsData((prev_27) => ({
      ...prev_27,
      ...newSettings
    }));
    logEvent("tengu_autoupdate_channel_changed", {
      channel: "stable",
      minimum_version_set: choice === "stay"
    });
  } }) : /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, marginY: insideModal ? void 0 : 1, children: [
    /* @__PURE__ */ jsx(SearchBox, { query: searchQuery, isFocused: isSearchMode && !headerFocused, isTerminalFocused, cursorOffset: searchCursorOffset, placeholder: "Search settings\u2026" }),
    /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: filteredSettingsItems.length === 0 ? /* @__PURE__ */ jsxs(Text, { dimColor: true, italic: true, children: [
      'No settings match "',
      searchQuery,
      '"'
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      scrollOffset > 0 && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        figures.arrowUp,
        " ",
        scrollOffset,
        " more above"
      ] }),
      filteredSettingsItems.slice(scrollOffset, scrollOffset + maxVisible).map((setting_2, i) => {
        const actualIndex = scrollOffset + i;
        const isSelected = actualIndex === selectedIndex && !headerFocused && !isSearchMode;
        return /* @__PURE__ */ jsx(React.Fragment, { children: /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Box, { width: 44, children: /* @__PURE__ */ jsxs(Text, { color: isSelected ? "suggestion" : void 0, children: [
            isSelected ? figures.pointer : " ",
            " ",
            setting_2.label
          ] }) }),
          /* @__PURE__ */ jsx(Box, { children: setting_2.type === "boolean" ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Text, { color: isSelected ? "suggestion" : void 0, children: setting_2.value.toString() }),
            showThinkingWarning && setting_2.id === "thinkingEnabled" && /* @__PURE__ */ jsxs(Text, { color: "warning", children: [
              " ",
              "Changing thinking mode mid-conversation will increase latency and may reduce quality."
            ] })
          ] }) : setting_2.id === "theme" ? /* @__PURE__ */ jsx(Text, { color: isSelected ? "suggestion" : void 0, children: THEME_LABELS[setting_2.value.toString()] ?? setting_2.value.toString() }) : setting_2.id === "notifChannel" ? /* @__PURE__ */ jsx(Text, { color: isSelected ? "suggestion" : void 0, children: /* @__PURE__ */ jsx(NotifChannelLabel, { value: setting_2.value.toString() }) }) : setting_2.id === "defaultPermissionMode" ? /* @__PURE__ */ jsx(Text, { color: isSelected ? "suggestion" : void 0, children: permissionModeTitle(setting_2.value) }) : setting_2.id === "autoUpdatesChannel" && autoUpdaterDisabledReason ? /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
            /* @__PURE__ */ jsx(Text, { color: isSelected ? "suggestion" : void 0, children: "disabled" }),
            /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
              "(",
              formatAutoUpdaterDisabledReason(autoUpdaterDisabledReason),
              ")"
            ] })
          ] }) : /* @__PURE__ */ jsx(Text, { color: isSelected ? "suggestion" : void 0, children: setting_2.value.toString() }) }, isSelected ? "selected" : "unselected")
        ] }) }, setting_2.id);
      }),
      scrollOffset + maxVisible < filteredSettingsItems.length && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        figures.arrowDown,
        " ",
        filteredSettingsItems.length - scrollOffset - maxVisible,
        " ",
        "more below"
      ] })
    ] }) }),
    headerFocused ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\u2190/\u2192 tab", action: "switch" }),
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\u2193", action: "return" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Settings", fallback: "Esc", description: "close" })
    ] }) }) : isSearchMode ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(Text, { children: "Type to filter" }),
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter/\u2193", action: "select" }),
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\u2191", action: "tabs" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Settings", fallback: "Esc", description: "clear" })
    ] }) }) : /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "select:accept", context: "Settings", fallback: "Space", description: "change" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "settings:close", context: "Settings", fallback: "Enter", description: "save" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "settings:search", context: "Settings", fallback: "/", description: "search" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Settings", fallback: "Esc", description: "cancel" })
    ] }) })
  ] }) });
}
function teammateModelDisplayString(value) {
  if (value === void 0) {
    return modelDisplayString(getHardcodedTeammateModelFallback());
  }
  if (value === null) return "Default (leader's model)";
  return modelDisplayString(value);
}
const THEME_LABELS = {
  auto: "Auto (match terminal)",
  dark: "Dark mode",
  light: "Light mode",
  "dark-daltonized": "Dark mode (colorblind-friendly)",
  "light-daltonized": "Light mode (colorblind-friendly)",
  "dark-ansi": "Dark mode (ANSI colors only)",
  "light-ansi": "Light mode (ANSI colors only)"
};
function NotifChannelLabel(t0) {
  const $ = _c(4);
  const {
    value
  } = t0;
  switch (value) {
    case "auto": {
      return "Auto";
    }
    case "iterm2": {
      let t1;
      if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t1 = /* @__PURE__ */ jsxs(Text, { children: [
          "iTerm2 ",
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: "(OSC 9)" })
        ] });
        $[0] = t1;
      } else {
        t1 = $[0];
      }
      return t1;
    }
    case "terminal_bell": {
      let t1;
      if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t1 = /* @__PURE__ */ jsxs(Text, { children: [
          "Terminal Bell ",
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: "(\\a)" })
        ] });
        $[1] = t1;
      } else {
        t1 = $[1];
      }
      return t1;
    }
    case "kitty": {
      let t1;
      if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t1 = /* @__PURE__ */ jsxs(Text, { children: [
          "Kitty ",
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: "(OSC 99)" })
        ] });
        $[2] = t1;
      } else {
        t1 = $[2];
      }
      return t1;
    }
    case "ghostty": {
      let t1;
      if ($[3] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t1 = /* @__PURE__ */ jsxs(Text, { children: [
          "Ghostty ",
          /* @__PURE__ */ jsx(Text, { dimColor: true, children: "(OSC 777)" })
        ] });
        $[3] = t1;
      } else {
        t1 = $[3];
      }
      return t1;
    }
    case "iterm2_with_bell": {
      return "iTerm2 w/ Bell";
    }
    case "notifications_disabled": {
      return "Disabled";
    }
    default: {
      return value;
    }
  }
}
export {
  Config
};
