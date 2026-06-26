import { jsx } from "react/jsx-runtime";
const feature = (_name) => false;
import chalk from "chalk";
import { useMemo, useRef } from "react";
import "../context/voice.js";
import { useClipboardImageHint } from "../hooks/useClipboardImageHint.js";
import { useSettings } from "../hooks/useSettings.js";
import { useTextInput } from "../hooks/useTextInput.js";
import { Box, color, useTerminalFocus, useTheme } from "../ink.js";
import { isEnvTruthy } from "../utils/envUtils.js";
import { BaseTextInput } from "./BaseTextInput.js";
import { hueToRgb } from "./Spinner/utils.js";
const BARS = " \u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588";
const CURSOR_WAVEFORM_WIDTH = 1;
const SMOOTH = 0.7;
const LEVEL_BOOST = 1.8;
const SILENCE_THRESHOLD = 0.15;
function TextInput(props) {
  const [theme] = useTheme();
  const isTerminalFocused = useTerminalFocus();
  const accessibilityEnabled = useMemo(() => isEnvTruthy(process.env.CLAUDE_CODE_ACCESSIBILITY), []);
  const settings = useSettings();
  const reducedMotion = settings.prefersReducedMotion ?? false;
  const voiceState = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useVoiceState((s) => s.voiceState)
  ) : "idle";
  const isVoiceRecording = voiceState === "recording";
  const audioLevels = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useVoiceState((s_0) => s_0.voiceAudioLevels)
  ) : [];
  const smoothedRef = useRef(new Array(CURSOR_WAVEFORM_WIDTH).fill(0));
  const needsAnimation = isVoiceRecording && !reducedMotion;
  const [animRef, animTime] = false ? (
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useAnimationFrame(needsAnimation ? 50 : null)
  ) : [() => {
  }, 0];
  useClipboardImageHint(isTerminalFocused, !!props.onImagePaste);
  const canShowCursor = isTerminalFocused && !accessibilityEnabled;
  let invert;
  if (!canShowCursor) {
    invert = (text) => text;
  } else if (isVoiceRecording && !reducedMotion) {
    const smoothed = smoothedRef.current;
    const raw = audioLevels.length > 0 ? audioLevels[audioLevels.length - 1] ?? 0 : 0;
    const target = Math.min(raw * LEVEL_BOOST, 1);
    smoothed[0] = (smoothed[0] ?? 0) * SMOOTH + target * (1 - SMOOTH);
    const displayLevel = smoothed[0] ?? 0;
    const barIndex = Math.max(1, Math.min(Math.round(displayLevel * (BARS.length - 1)), BARS.length - 1));
    const isSilent = raw < SILENCE_THRESHOLD;
    const hue = animTime / 1e3 * 90 % 360;
    const {
      r,
      g,
      b
    } = isSilent ? {
      r: 128,
      g: 128,
      b: 128
    } : hueToRgb(hue);
    invert = () => chalk.rgb(r, g, b)(BARS[barIndex]);
  } else {
    invert = chalk.inverse;
  }
  const textInputState = useTextInput({
    value: props.value,
    onChange: props.onChange,
    onSubmit: props.onSubmit,
    onExit: props.onExit,
    onExitMessage: props.onExitMessage,
    onHistoryReset: props.onHistoryReset,
    onHistoryUp: props.onHistoryUp,
    onHistoryDown: props.onHistoryDown,
    onClearInput: props.onClearInput,
    focus: props.focus,
    mask: props.mask,
    multiline: props.multiline,
    cursorChar: props.showCursor ? " " : "",
    highlightPastedText: props.highlightPastedText,
    invert,
    themeText: color("text", theme),
    columns: props.columns,
    maxVisibleLines: props.maxVisibleLines,
    onImagePaste: props.onImagePaste,
    disableCursorMovementForUpDownKeys: props.disableCursorMovementForUpDownKeys,
    disableEscapeDoublePress: props.disableEscapeDoublePress,
    externalOffset: props.cursorOffset,
    onOffsetChange: props.onChangeCursorOffset,
    inputFilter: props.inputFilter,
    inlineGhostText: props.inlineGhostText,
    dim: chalk.dim
  });
  return /* @__PURE__ */ jsx(Box, { ref: animRef, children: /* @__PURE__ */ jsx(BaseTextInput, { inputState: textInputState, terminalFocus: isTerminalFocused, highlights: props.highlights, invert, hidePlaceholderText: isVoiceRecording, ...props }) });
}
export {
  TextInput as default
};
