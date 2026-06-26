import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import chalk from "chalk";
import * as React from "react";
import { ModelPicker } from "../../components/ModelPicker.js";
import { COMMON_HELP_ARGS, COMMON_INFO_ARGS } from "../../constants/xml.js";
import { logEvent } from "../../services/analytics/index.js";
import { useAppState, useSetAppState } from "../../state/AppState.js";
import { isBilledAsExtraUsage } from "../../utils/extraUsage.js";
import { clearFastModeCooldown, isFastModeAvailable, isFastModeEnabled, isFastModeSupportedByModel } from "../../utils/fastMode.js";
import { MODEL_ALIASES } from "../../utils/model/aliases.js";
import { checkOpus1mAccess, checkSonnet1mAccess } from "../../utils/model/check1mAccess.js";
import { getDefaultMainLoopModelSetting, isOpus1mMergeEnabled, renderDefaultModelSetting } from "../../utils/model/model.js";
import { isModelAllowed } from "../../utils/model/modelAllowlist.js";
import { validateModel } from "../../utils/model/validateModel.js";
function ModelPickerWrapper(t0) {
  const $ = _c(17);
  const {
    onDone
  } = t0;
  const mainLoopModel = useAppState(_temp);
  const mainLoopModelForSession = useAppState(_temp2);
  const isFastMode = useAppState(_temp3);
  const setAppState = useSetAppState();
  let t1;
  if ($[0] !== mainLoopModel || $[1] !== onDone) {
    t1 = function handleCancel2() {
      logEvent("tengu_model_command_menu", {
        action: "cancel"
      });
      const displayModel = renderModelLabel(mainLoopModel);
      onDone(`Kept model as ${chalk.bold(displayModel)}`, {
        display: "system"
      });
    };
    $[0] = mainLoopModel;
    $[1] = onDone;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  const handleCancel = t1;
  let t2;
  if ($[3] !== isFastMode || $[4] !== mainLoopModel || $[5] !== onDone || $[6] !== setAppState) {
    t2 = function handleSelect2(model, effort) {
      logEvent("tengu_model_command_menu", {
        action: model,
        from_model: mainLoopModel,
        to_model: model
      });
      setAppState((prev) => ({
        ...prev,
        mainLoopModel: model,
        mainLoopModelForSession: null
      }));
      let message = `Set model to ${chalk.bold(renderModelLabel(model))}`;
      if (effort !== void 0) {
        message = message + ` with ${chalk.bold(effort)} effort`;
      }
      let wasFastModeToggledOn = void 0;
      if (isFastModeEnabled()) {
        clearFastModeCooldown();
        if (!isFastModeSupportedByModel(model) && isFastMode) {
          setAppState(_temp4);
          wasFastModeToggledOn = false;
        } else {
          if (isFastModeSupportedByModel(model) && isFastModeAvailable() && isFastMode) {
            message = message + " \xB7 Fast mode ON";
            wasFastModeToggledOn = true;
          }
        }
      }
      if (isBilledAsExtraUsage(model, wasFastModeToggledOn === true, isOpus1mMergeEnabled())) {
        message = message + " \xB7 Billed as extra usage";
      }
      if (wasFastModeToggledOn === false) {
        message = message + " \xB7 Fast mode OFF";
      }
      onDone(message);
    };
    $[3] = isFastMode;
    $[4] = mainLoopModel;
    $[5] = onDone;
    $[6] = setAppState;
    $[7] = t2;
  } else {
    t2 = $[7];
  }
  const handleSelect = t2;
  let t3;
  if ($[8] !== isFastMode || $[9] !== mainLoopModel) {
    t3 = isFastModeEnabled() && isFastMode && isFastModeSupportedByModel(mainLoopModel) && isFastModeAvailable();
    $[8] = isFastMode;
    $[9] = mainLoopModel;
    $[10] = t3;
  } else {
    t3 = $[10];
  }
  let t4;
  if ($[11] !== handleCancel || $[12] !== handleSelect || $[13] !== mainLoopModel || $[14] !== mainLoopModelForSession || $[15] !== t3) {
    t4 = /* @__PURE__ */ jsx(ModelPicker, { initial: mainLoopModel, sessionModel: mainLoopModelForSession, onSelect: handleSelect, onCancel: handleCancel, isStandaloneCommand: true, showFastModeNotice: t3 });
    $[11] = handleCancel;
    $[12] = handleSelect;
    $[13] = mainLoopModel;
    $[14] = mainLoopModelForSession;
    $[15] = t3;
    $[16] = t4;
  } else {
    t4 = $[16];
  }
  return t4;
}
function _temp4(prev_0) {
  return {
    ...prev_0,
    fastMode: false
  };
}
function _temp3(s_1) {
  return s_1.fastMode;
}
function _temp2(s_0) {
  return s_0.mainLoopModelForSession;
}
function _temp(s) {
  return s.mainLoopModel;
}
function SetModelAndClose({
  args,
  onDone
}) {
  const isFastMode = useAppState((s) => s.fastMode);
  const setAppState = useSetAppState();
  const model = args === "default" ? null : args;
  React.useEffect(() => {
    async function handleModelChange() {
      if (model && !isModelAllowed(model)) {
        onDone(`Model '${model}' is not available. Your organization restricts model selection.`, {
          display: "system"
        });
        return;
      }
      if (model && isOpus1mUnavailable(model)) {
        onDone(`Opus 4.6 with 1M context is not available for your account. Learn more: https://code.claude.com/docs/en/model-config#extended-context-with-1m`, {
          display: "system"
        });
        return;
      }
      if (model && isSonnet1mUnavailable(model)) {
        onDone(`Sonnet 4.6 with 1M context is not available for your account. Learn more: https://code.claude.com/docs/en/model-config#extended-context-with-1m`, {
          display: "system"
        });
        return;
      }
      if (!model) {
        setModel(null);
        return;
      }
      if (isKnownAlias(model)) {
        setModel(model);
        return;
      }
      try {
        const {
          valid,
          error: error_0
        } = await validateModel(model);
        if (valid) {
          setModel(model);
        } else {
          onDone(error_0 || `Model '${model}' not found`, {
            display: "system"
          });
        }
      } catch (error) {
        onDone(`Failed to validate model: ${error.message}`, {
          display: "system"
        });
      }
    }
    function setModel(modelValue) {
      setAppState((prev) => ({
        ...prev,
        mainLoopModel: modelValue,
        mainLoopModelForSession: null
      }));
      let message = `Set model to ${chalk.bold(renderModelLabel(modelValue))}`;
      let wasFastModeToggledOn = void 0;
      if (isFastModeEnabled()) {
        clearFastModeCooldown();
        if (!isFastModeSupportedByModel(modelValue) && isFastMode) {
          setAppState((prev_0) => ({
            ...prev_0,
            fastMode: false
          }));
          wasFastModeToggledOn = false;
        } else if (isFastModeSupportedByModel(modelValue) && isFastMode) {
          message += ` \xB7 Fast mode ON`;
          wasFastModeToggledOn = true;
        }
      }
      if (isBilledAsExtraUsage(modelValue, wasFastModeToggledOn === true, isOpus1mMergeEnabled())) {
        message += ` \xB7 Billed as extra usage`;
      }
      if (wasFastModeToggledOn === false) {
        message += ` \xB7 Fast mode OFF`;
      }
      onDone(message);
    }
    void handleModelChange();
  }, [model, onDone, setAppState]);
  return null;
}
function isKnownAlias(model) {
  return MODEL_ALIASES.includes(model.toLowerCase().trim());
}
function isOpus1mUnavailable(model) {
  const m = model.toLowerCase();
  return !checkOpus1mAccess() && !isOpus1mMergeEnabled() && m.includes("opus") && m.includes("[1m]");
}
function isSonnet1mUnavailable(model) {
  const m = model.toLowerCase();
  return !checkSonnet1mAccess() && (m.includes("sonnet[1m]") || m.includes("sonnet-4-6[1m]"));
}
function ShowModelAndClose(t0) {
  const {
    onDone
  } = t0;
  const mainLoopModel = useAppState(_temp7);
  const mainLoopModelForSession = useAppState(_temp8);
  const effortValue = useAppState(_temp9);
  const displayModel = renderModelLabel(mainLoopModel);
  const effortInfo = effortValue !== void 0 ? ` (effort: ${effortValue})` : "";
  if (mainLoopModelForSession) {
    onDone(`Current model: ${chalk.bold(renderModelLabel(mainLoopModelForSession))} (session override from plan mode)
Base model: ${displayModel}${effortInfo}`);
  } else {
    onDone(`Current model: ${displayModel}${effortInfo}`);
  }
  return null;
}
function _temp9(s_1) {
  return s_1.effortValue;
}
function _temp8(s_0) {
  return s_0.mainLoopModelForSession;
}
function _temp7(s) {
  return s.mainLoopModel;
}
const call = async (onDone, _context, args) => {
  args = args?.trim() || "";
  if (COMMON_INFO_ARGS.includes(args)) {
    logEvent("tengu_model_command_inline_help", {
      args
    });
    return /* @__PURE__ */ jsx(ShowModelAndClose, { onDone });
  }
  if (COMMON_HELP_ARGS.includes(args)) {
    onDone("Run /model to open the model selection menu, or /model [modelName] to set the model.", {
      display: "system"
    });
    return;
  }
  if (args) {
    logEvent("tengu_model_command_inline", {
      args
    });
    return /* @__PURE__ */ jsx(SetModelAndClose, { args, onDone });
  }
  return /* @__PURE__ */ jsx(ModelPickerWrapper, { onDone });
};
function renderModelLabel(model) {
  const rendered = renderDefaultModelSetting(model ?? getDefaultMainLoopModelSetting());
  return model === null ? `${rendered} (default)` : rendered;
}
export {
  call
};
