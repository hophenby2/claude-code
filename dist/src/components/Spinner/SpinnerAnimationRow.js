import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { useMemo, useRef } from "react";
import { stringWidth } from "../../ink/stringWidth.js";
import { Box, Text, useAnimationFrame } from "../../ink.js";
import { formatDuration, formatNumber } from "../../utils/format.js";
import { toInkColor } from "../../utils/ink.js";
import { Byline } from "../design-system/Byline.js";
import { GlimmerMessage } from "./GlimmerMessage.js";
import { SpinnerGlyph } from "./SpinnerGlyph.js";
import { useStalledAnimation } from "./useStalledAnimation.js";
import { interpolateColor, toRGBColor } from "./utils.js";
const SEP_WIDTH = stringWidth(" \xB7 ");
const THINKING_BARE_WIDTH = stringWidth("thinking");
const SHOW_TOKENS_AFTER_MS = 3e4;
const THINKING_INACTIVE = {
  r: 153,
  g: 153,
  b: 153
};
const THINKING_INACTIVE_SHIMMER = {
  r: 185,
  g: 185,
  b: 185
};
const THINKING_DELAY_MS = 3e3;
const THINKING_GLOW_PERIOD_S = 2;
function SpinnerAnimationRow({
  mode,
  reducedMotion,
  hasActiveTools,
  responseLengthRef,
  message,
  messageColor,
  shimmerColor,
  overrideColor,
  loadingStartTimeRef,
  totalPausedMsRef,
  pauseStartTimeRef,
  spinnerSuffix,
  verbose,
  columns,
  hasRunningTeammates,
  teammateTokens,
  foregroundedTeammate,
  leaderIsIdle = false,
  thinkingStatus,
  effortSuffix
}) {
  const [viewportRef, time] = useAnimationFrame(reducedMotion ? null : 50);
  const now = Date.now();
  const elapsedTimeMs = pauseStartTimeRef.current !== null ? pauseStartTimeRef.current - loadingStartTimeRef.current - totalPausedMsRef.current : now - loadingStartTimeRef.current - totalPausedMsRef.current;
  const derivedStart = now - elapsedTimeMs;
  const turnStartRef = useRef(derivedStart);
  if (!hasRunningTeammates || derivedStart < turnStartRef.current) {
    turnStartRef.current = derivedStart;
  }
  const currentResponseLength = responseLengthRef.current;
  const {
    isStalled,
    stalledIntensity
  } = useStalledAnimation(time, currentResponseLength, hasActiveTools || leaderIsIdle, reducedMotion);
  const frame = reducedMotion ? 0 : Math.floor(time / 120);
  const glimmerSpeed = mode === "requesting" ? 50 : 200;
  const glimmerMessageWidth = useMemo(() => stringWidth(message), [message]);
  const cycleLength = glimmerMessageWidth + 20;
  const cyclePosition = Math.floor(time / glimmerSpeed);
  const glimmerIndex = reducedMotion ? -100 : isStalled ? -100 : mode === "requesting" ? cyclePosition % cycleLength - 10 : glimmerMessageWidth + 10 - cyclePosition % cycleLength;
  const flashOpacity = reducedMotion ? 0 : mode === "tool-use" ? (Math.sin(time / 1e3 * Math.PI) + 1) / 2 : 0;
  const tokenCounterRef = useRef(currentResponseLength);
  if (reducedMotion) {
    tokenCounterRef.current = currentResponseLength;
  } else {
    const gap = currentResponseLength - tokenCounterRef.current;
    if (gap > 0) {
      let increment;
      if (gap < 70) {
        increment = 3;
      } else if (gap < 200) {
        increment = Math.max(8, Math.ceil(gap * 0.15));
      } else {
        increment = 50;
      }
      tokenCounterRef.current = Math.min(tokenCounterRef.current + increment, currentResponseLength);
    }
  }
  const displayedResponseLength = tokenCounterRef.current;
  const leaderTokens = Math.round(displayedResponseLength / 4);
  const effectiveElapsedMs = hasRunningTeammates ? Math.max(elapsedTimeMs, now - turnStartRef.current) : elapsedTimeMs;
  const timerText = formatDuration(effectiveElapsedMs);
  const timerWidth = stringWidth(timerText);
  const totalTokens = foregroundedTeammate && !foregroundedTeammate.isIdle ? foregroundedTeammate.progress?.tokenCount ?? 0 : leaderTokens + teammateTokens;
  const tokenCount = formatNumber(totalTokens);
  const tokensText = hasRunningTeammates ? `${tokenCount} tokens` : `${figures.arrowDown} ${tokenCount} tokens`;
  const tokensWidth = stringWidth(tokensText);
  let thinkingText = thinkingStatus === "thinking" ? `thinking${effortSuffix}` : typeof thinkingStatus === "number" ? `thought for ${Math.max(1, Math.round(thinkingStatus / 1e3))}s` : null;
  let thinkingWidthValue = thinkingText ? stringWidth(thinkingText) : 0;
  const messageWidth = glimmerMessageWidth + 2;
  const sep = SEP_WIDTH;
  const wantsThinking = thinkingStatus !== null;
  const wantsTimerAndTokens = verbose || hasRunningTeammates || effectiveElapsedMs > SHOW_TOKENS_AFTER_MS;
  const availableSpace = columns - messageWidth - 5;
  let showThinking = wantsThinking && availableSpace > thinkingWidthValue;
  if (!showThinking && wantsThinking && thinkingStatus === "thinking" && effortSuffix) {
    if (availableSpace > THINKING_BARE_WIDTH) {
      thinkingText = "thinking";
      thinkingWidthValue = THINKING_BARE_WIDTH;
      showThinking = true;
    }
  }
  const usedAfterThinking = showThinking ? thinkingWidthValue + sep : 0;
  const showTimer = wantsTimerAndTokens && availableSpace > usedAfterThinking + timerWidth;
  const usedAfterTimer = usedAfterThinking + (showTimer ? timerWidth + sep : 0);
  const showTokens = wantsTimerAndTokens && totalTokens > 0 && availableSpace > usedAfterTimer + tokensWidth;
  const thinkingOnly = showThinking && thinkingStatus === "thinking" && !spinnerSuffix && !showTimer && !showTokens && true;
  const thinkingElapsedSec = (time - THINKING_DELAY_MS) / 1e3;
  const thinkingOpacity = time < THINKING_DELAY_MS ? 0 : (Math.sin(thinkingElapsedSec * Math.PI * 2 / THINKING_GLOW_PERIOD_S) + 1) / 2;
  const thinkingShimmerColor = toRGBColor(interpolateColor(THINKING_INACTIVE, THINKING_INACTIVE_SHIMMER, thinkingOpacity));
  const parts = [...spinnerSuffix ? [/* @__PURE__ */ jsx(Text, { dimColor: true, children: spinnerSuffix }, "suffix")] : [], ...showTimer ? [/* @__PURE__ */ jsx(Text, { dimColor: true, children: timerText }, "elapsedTime")] : [], ...showTokens ? [/* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
    !hasRunningTeammates && /* @__PURE__ */ jsx(SpinnerModeGlyph, { mode }),
    /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      tokenCount,
      " tokens"
    ] })
  ] }, "tokens")] : [], ...showThinking && thinkingText ? [thinkingStatus === "thinking" && !reducedMotion ? /* @__PURE__ */ jsx(Text, { color: thinkingShimmerColor, children: thinkingOnly ? `(${thinkingText})` : thinkingText }, "thinking") : /* @__PURE__ */ jsx(Text, { dimColor: true, children: thinkingText }, "thinking")] : []];
  const status = foregroundedTeammate && !foregroundedTeammate.isIdle ? /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: "(esc to interrupt " }),
    /* @__PURE__ */ jsx(Text, { color: toInkColor(foregroundedTeammate.identity.color), children: foregroundedTeammate.identity.agentName }),
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: ")" })
  ] }) : !foregroundedTeammate && parts.length > 0 ? thinkingOnly ? /* @__PURE__ */ jsx(Byline, { children: parts }) : /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: "(" }),
    /* @__PURE__ */ jsx(Byline, { children: parts }),
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: ")" })
  ] }) : null;
  return /* @__PURE__ */ jsxs(Box, { ref: viewportRef, flexDirection: "row", flexWrap: "wrap", marginTop: 1, width: "100%", children: [
    /* @__PURE__ */ jsx(SpinnerGlyph, { frame, messageColor, stalledIntensity: overrideColor ? 0 : stalledIntensity, reducedMotion, time }),
    /* @__PURE__ */ jsx(GlimmerMessage, { message, mode, messageColor, glimmerIndex, flashOpacity, shimmerColor, stalledIntensity: overrideColor ? 0 : stalledIntensity }),
    status
  ] });
}
function SpinnerModeGlyph(t0) {
  const $ = _c(2);
  const {
    mode
  } = t0;
  switch (mode) {
    case "tool-input":
    case "tool-use":
    case "responding":
    case "thinking": {
      let t1;
      if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t1 = /* @__PURE__ */ jsx(Box, { width: 2, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: figures.arrowDown }) });
        $[0] = t1;
      } else {
        t1 = $[0];
      }
      return t1;
    }
    case "requesting": {
      let t1;
      if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t1 = /* @__PURE__ */ jsx(Box, { width: 2, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: figures.arrowUp }) });
        $[1] = t1;
      } else {
        t1 = $[1];
      }
      return t1;
    }
  }
}
export {
  SpinnerAnimationRow
};
