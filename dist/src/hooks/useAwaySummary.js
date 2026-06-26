const feature = (_name) => false;
import { useEffect, useRef } from "react";
import {
  getTerminalFocusState,
  subscribeTerminalFocus
} from "../ink/terminal-focus-state.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import { generateAwaySummary } from "../services/awaySummary.js";
import { createAwaySummaryMessage } from "../utils/messages.js";
const BLUR_DELAY_MS = 5 * 6e4;
function hasSummarySinceLastUserTurn(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type === "user" && !m.isMeta && !m.isCompactSummary) return false;
    if (m.type === "system" && m.subtype === "away_summary") return true;
  }
  return false;
}
function useAwaySummary(messages, setMessages, isLoading) {
  const timerRef = useRef(null);
  const abortRef = useRef(null);
  const messagesRef = useRef(messages);
  const isLoadingRef = useRef(isLoading);
  const pendingRef = useRef(false);
  const generateRef = useRef(null);
  messagesRef.current = messages;
  isLoadingRef.current = isLoading;
  const gbEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_sedge_lantern",
    false
  );
  useEffect(() => {
    if (true) return;
    if (!gbEnabled) return;
    function clearTimer() {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
    function abortInFlight() {
      abortRef.current?.abort();
      abortRef.current = null;
    }
    async function generate() {
      pendingRef.current = false;
      if (hasSummarySinceLastUserTurn(messagesRef.current)) return;
      abortInFlight();
      const controller = new AbortController();
      abortRef.current = controller;
      const text = await generateAwaySummary(
        messagesRef.current,
        controller.signal
      );
      if (controller.signal.aborted || text === null) return;
      setMessages((prev) => [...prev, createAwaySummaryMessage(text)]);
    }
    function onBlurTimerFire() {
      timerRef.current = null;
      if (isLoadingRef.current) {
        pendingRef.current = true;
        return;
      }
      void generate();
    }
    function onFocusChange() {
      const state = getTerminalFocusState();
      if (state === "blurred") {
        clearTimer();
        timerRef.current = setTimeout(onBlurTimerFire, BLUR_DELAY_MS);
      } else if (state === "focused") {
        clearTimer();
        abortInFlight();
        pendingRef.current = false;
      }
    }
    const unsubscribe = subscribeTerminalFocus(onFocusChange);
    onFocusChange();
    generateRef.current = generate;
    return () => {
      unsubscribe();
      clearTimer();
      abortInFlight();
      generateRef.current = null;
    };
  }, [gbEnabled, setMessages]);
  useEffect(() => {
    if (isLoading) return;
    if (!pendingRef.current) return;
    if (getTerminalFocusState() !== "blurred") return;
    void generateRef.current?.();
  }, [isLoading]);
}
export {
  useAwaySummary
};
