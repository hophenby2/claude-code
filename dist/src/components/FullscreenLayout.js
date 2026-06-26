import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { createContext, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { fileURLToPath } from "url";
import { ModalContext } from "../context/modalContext.js";
import { PromptOverlayProvider, usePromptOverlay, usePromptOverlayDialog } from "../context/promptOverlayContext.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import ScrollBox from "../ink/components/ScrollBox.js";
import instances from "../ink/instances.js";
import { Box, Text } from "../ink.js";
import { openBrowser, openPath } from "../utils/browser.js";
import { isFullscreenEnvEnabled } from "../utils/fullscreen.js";
import { plural } from "../utils/stringUtils.js";
import { isNullRenderingAttachment } from "./messages/nullRenderingAttachments.js";
import PromptInputFooterSuggestions from "./PromptInput/PromptInputFooterSuggestions.js";
const MODAL_TRANSCRIPT_PEEK = 2;
const ScrollChromeContext = createContext({
  setStickyPrompt: () => {
  }
});
function useUnseenDivider(messageCount) {
  const [dividerIndex, setDividerIndex] = useState(null);
  const countRef = useRef(messageCount);
  countRef.current = messageCount;
  const dividerYRef = useRef(null);
  const onRepin = useCallback(() => {
    setDividerIndex(null);
  }, []);
  const onScrollAway = useCallback((handle) => {
    const max = Math.max(0, handle.getScrollHeight() - handle.getViewportHeight());
    if (handle.getScrollTop() + handle.getPendingDelta() >= max) return;
    if (dividerYRef.current === null) {
      dividerYRef.current = handle.getScrollHeight();
      setDividerIndex(countRef.current);
    }
  }, []);
  const jumpToNew = useCallback((handle_0) => {
    if (!handle_0) return;
    handle_0.scrollToBottom();
  }, []);
  useEffect(() => {
    if (dividerIndex === null) {
      dividerYRef.current = null;
    } else if (messageCount < dividerIndex) {
      dividerYRef.current = null;
      setDividerIndex(null);
    }
  }, [messageCount, dividerIndex]);
  const shiftDivider = useCallback((indexDelta, heightDelta) => {
    setDividerIndex((idx) => idx === null ? null : idx + indexDelta);
    if (dividerYRef.current !== null) {
      dividerYRef.current += heightDelta;
    }
  }, []);
  return {
    dividerIndex,
    dividerYRef,
    onScrollAway,
    onRepin,
    jumpToNew,
    shiftDivider
  };
}
function countUnseenAssistantTurns(messages, dividerIndex) {
  let count = 0;
  let prevWasAssistant = false;
  for (let i = dividerIndex; i < messages.length; i++) {
    const m = messages[i];
    if (m.type === "progress") continue;
    if (m.type === "assistant" && !assistantHasVisibleText(m)) continue;
    const isAssistant = m.type === "assistant";
    if (isAssistant && !prevWasAssistant) count++;
    prevWasAssistant = isAssistant;
  }
  return count;
}
function assistantHasVisibleText(m) {
  if (m.type !== "assistant") return false;
  for (const b of m.message.content) {
    if (b.type === "text" && b.text.trim() !== "") return true;
  }
  return false;
}
function computeUnseenDivider(messages, dividerIndex) {
  if (dividerIndex === null) return void 0;
  let anchorIdx = dividerIndex;
  while (anchorIdx < messages.length && (messages[anchorIdx]?.type === "progress" || isNullRenderingAttachment(messages[anchorIdx]))) {
    anchorIdx++;
  }
  const uuid = messages[anchorIdx]?.uuid;
  if (!uuid) return void 0;
  const count = countUnseenAssistantTurns(messages, dividerIndex);
  return {
    firstUnseenUuid: uuid,
    count: Math.max(1, count)
  };
}
function FullscreenLayout(t0) {
  const $ = _c(47);
  const {
    scrollable,
    bottom,
    overlay,
    bottomFloat,
    modal,
    modalScrollRef,
    scrollRef,
    dividerYRef,
    hidePill: t1,
    hideSticky: t2,
    newMessageCount: t3,
    onPillClick
  } = t0;
  const hidePill = t1 === void 0 ? false : t1;
  const hideSticky = t2 === void 0 ? false : t2;
  const newMessageCount = t3 === void 0 ? 0 : t3;
  const {
    rows: terminalRows,
    columns
  } = useTerminalSize();
  const [stickyPrompt, setStickyPrompt] = useState(null);
  let t4;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t4 = {
      setStickyPrompt
    };
    $[0] = t4;
  } else {
    t4 = $[0];
  }
  const chromeCtx = t4;
  let t5;
  if ($[1] !== scrollRef) {
    t5 = (listener) => scrollRef?.current?.subscribe(listener) ?? _temp;
    $[1] = scrollRef;
    $[2] = t5;
  } else {
    t5 = $[2];
  }
  const subscribe = t5;
  let t6;
  if ($[3] !== dividerYRef || $[4] !== scrollRef) {
    t6 = () => {
      const s = scrollRef?.current;
      const dividerY = dividerYRef?.current;
      if (!s || dividerY == null) {
        return false;
      }
      return s.getScrollTop() + s.getPendingDelta() + s.getViewportHeight() < dividerY;
    };
    $[3] = dividerYRef;
    $[4] = scrollRef;
    $[5] = t6;
  } else {
    t6 = $[5];
  }
  const pillVisible = useSyncExternalStore(subscribe, t6);
  let t7;
  if ($[6] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t7 = [];
    $[6] = t7;
  } else {
    t7 = $[6];
  }
  useLayoutEffect(_temp3, t7);
  if (isFullscreenEnvEnabled()) {
    const sticky = hideSticky ? null : stickyPrompt;
    const headerPrompt = sticky != null && sticky !== "clicked" && overlay == null ? sticky : null;
    const padCollapsed = sticky != null && overlay == null;
    let t82;
    if ($[7] !== headerPrompt) {
      t82 = headerPrompt && /* @__PURE__ */ jsx(StickyPromptHeader, { text: headerPrompt.text, onClick: headerPrompt.scrollTo });
      $[7] = headerPrompt;
      $[8] = t82;
    } else {
      t82 = $[8];
    }
    const t9 = padCollapsed ? 0 : 1;
    let t10;
    if ($[9] !== scrollable) {
      t10 = /* @__PURE__ */ jsx(ScrollChromeContext, { value: chromeCtx, children: scrollable });
      $[9] = scrollable;
      $[10] = t10;
    } else {
      t10 = $[10];
    }
    let t11;
    if ($[11] !== overlay || $[12] !== scrollRef || $[13] !== t10 || $[14] !== t9) {
      t11 = /* @__PURE__ */ jsxs(ScrollBox, { ref: scrollRef, flexGrow: 1, flexDirection: "column", paddingTop: t9, stickyScroll: true, children: [
        t10,
        overlay
      ] });
      $[11] = overlay;
      $[12] = scrollRef;
      $[13] = t10;
      $[14] = t9;
      $[15] = t11;
    } else {
      t11 = $[15];
    }
    let t12;
    if ($[16] !== hidePill || $[17] !== newMessageCount || $[18] !== onPillClick || $[19] !== overlay || $[20] !== pillVisible) {
      t12 = !hidePill && pillVisible && overlay == null && /* @__PURE__ */ jsx(NewMessagesPill, { count: newMessageCount, onClick: onPillClick });
      $[16] = hidePill;
      $[17] = newMessageCount;
      $[18] = onPillClick;
      $[19] = overlay;
      $[20] = pillVisible;
      $[21] = t12;
    } else {
      t12 = $[21];
    }
    let t13;
    if ($[22] !== bottomFloat) {
      t13 = bottomFloat != null && /* @__PURE__ */ jsx(Box, { position: "absolute", bottom: 0, right: 0, opaque: true, children: bottomFloat });
      $[22] = bottomFloat;
      $[23] = t13;
    } else {
      t13 = $[23];
    }
    let t14;
    if ($[24] !== t11 || $[25] !== t12 || $[26] !== t13 || $[27] !== t82) {
      t14 = /* @__PURE__ */ jsxs(Box, { flexGrow: 1, flexDirection: "column", overflow: "hidden", children: [
        t82,
        t11,
        t12,
        t13
      ] });
      $[24] = t11;
      $[25] = t12;
      $[26] = t13;
      $[27] = t82;
      $[28] = t14;
    } else {
      t14 = $[28];
    }
    let t15;
    let t16;
    if ($[29] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t15 = /* @__PURE__ */ jsx(SuggestionsOverlay, {});
      t16 = /* @__PURE__ */ jsx(DialogOverlay, {});
      $[29] = t15;
      $[30] = t16;
    } else {
      t15 = $[29];
      t16 = $[30];
    }
    let t17;
    if ($[31] !== bottom) {
      t17 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", flexShrink: 0, width: "100%", maxHeight: "50%", children: [
        t15,
        t16,
        /* @__PURE__ */ jsx(Box, { flexDirection: "column", width: "100%", flexGrow: 1, overflowY: "hidden", children: bottom })
      ] });
      $[31] = bottom;
      $[32] = t17;
    } else {
      t17 = $[32];
    }
    let t18;
    if ($[33] !== columns || $[34] !== modal || $[35] !== modalScrollRef || $[36] !== terminalRows) {
      t18 = modal != null && /* @__PURE__ */ jsx(ModalContext, { value: {
        rows: terminalRows - MODAL_TRANSCRIPT_PEEK - 1,
        columns: columns - 4,
        scrollRef: modalScrollRef ?? null
      }, children: /* @__PURE__ */ jsxs(Box, { position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: terminalRows - MODAL_TRANSCRIPT_PEEK, flexDirection: "column", overflow: "hidden", opaque: true, children: [
        /* @__PURE__ */ jsx(Box, { flexShrink: 0, children: /* @__PURE__ */ jsx(Text, { color: "permission", children: "\u2594".repeat(columns) }) }),
        /* @__PURE__ */ jsx(Box, { flexDirection: "column", paddingX: 2, flexShrink: 0, overflow: "hidden", children: modal })
      ] }) });
      $[33] = columns;
      $[34] = modal;
      $[35] = modalScrollRef;
      $[36] = terminalRows;
      $[37] = t18;
    } else {
      t18 = $[37];
    }
    let t19;
    if ($[38] !== t14 || $[39] !== t17 || $[40] !== t18) {
      t19 = /* @__PURE__ */ jsxs(PromptOverlayProvider, { children: [
        t14,
        t17,
        t18
      ] });
      $[38] = t14;
      $[39] = t17;
      $[40] = t18;
      $[41] = t19;
    } else {
      t19 = $[41];
    }
    return t19;
  }
  let t8;
  if ($[42] !== bottom || $[43] !== modal || $[44] !== overlay || $[45] !== scrollable) {
    t8 = /* @__PURE__ */ jsxs(Fragment, { children: [
      scrollable,
      bottom,
      overlay,
      modal
    ] });
    $[42] = bottom;
    $[43] = modal;
    $[44] = overlay;
    $[45] = scrollable;
    $[46] = t8;
  } else {
    t8 = $[46];
  }
  return t8;
}
function _temp3() {
  if (!isFullscreenEnvEnabled()) {
    return;
  }
  const ink = instances.get(process.stdout);
  if (!ink) {
    return;
  }
  ink.onHyperlinkClick = _temp2;
  return () => {
    ink.onHyperlinkClick = void 0;
  };
}
function _temp2(url) {
  if (url.startsWith("file:")) {
    try {
      openPath(fileURLToPath(url));
    } catch {
    }
  } else {
    openBrowser(url);
  }
}
function _temp() {
}
function NewMessagesPill(t0) {
  const $ = _c(10);
  const {
    count,
    onClick
  } = t0;
  const [hover, setHover] = useState(false);
  let t1;
  let t2;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => setHover(true);
    t2 = () => setHover(false);
    $[0] = t1;
    $[1] = t2;
  } else {
    t1 = $[0];
    t2 = $[1];
  }
  const t3 = hover ? "userMessageBackgroundHover" : "userMessageBackground";
  let t4;
  if ($[2] !== count) {
    t4 = count > 0 ? `${count} new ${plural(count, "message")}` : "Jump to bottom";
    $[2] = count;
    $[3] = t4;
  } else {
    t4 = $[3];
  }
  let t5;
  if ($[4] !== t3 || $[5] !== t4) {
    t5 = /* @__PURE__ */ jsxs(Text, { backgroundColor: t3, dimColor: true, children: [
      " ",
      t4,
      " ",
      figures.arrowDown,
      " "
    ] });
    $[4] = t3;
    $[5] = t4;
    $[6] = t5;
  } else {
    t5 = $[6];
  }
  let t6;
  if ($[7] !== onClick || $[8] !== t5) {
    t6 = /* @__PURE__ */ jsx(Box, { position: "absolute", bottom: 0, left: 0, right: 0, justifyContent: "center", children: /* @__PURE__ */ jsx(Box, { onClick, onMouseEnter: t1, onMouseLeave: t2, children: t5 }) });
    $[7] = onClick;
    $[8] = t5;
    $[9] = t6;
  } else {
    t6 = $[9];
  }
  return t6;
}
function StickyPromptHeader(t0) {
  const $ = _c(8);
  const {
    text,
    onClick
  } = t0;
  const [hover, setHover] = useState(false);
  const t1 = hover ? "userMessageBackgroundHover" : "userMessageBackground";
  let t2;
  let t3;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = () => setHover(true);
    t3 = () => setHover(false);
    $[0] = t2;
    $[1] = t3;
  } else {
    t2 = $[0];
    t3 = $[1];
  }
  let t4;
  if ($[2] !== text) {
    t4 = /* @__PURE__ */ jsxs(Text, { color: "subtle", wrap: "truncate-end", children: [
      figures.pointer,
      " ",
      text
    ] });
    $[2] = text;
    $[3] = t4;
  } else {
    t4 = $[3];
  }
  let t5;
  if ($[4] !== onClick || $[5] !== t1 || $[6] !== t4) {
    t5 = /* @__PURE__ */ jsx(Box, { flexShrink: 0, width: "100%", height: 1, paddingRight: 1, backgroundColor: t1, onClick, onMouseEnter: t2, onMouseLeave: t3, children: t4 });
    $[4] = onClick;
    $[5] = t1;
    $[6] = t4;
    $[7] = t5;
  } else {
    t5 = $[7];
  }
  return t5;
}
function SuggestionsOverlay() {
  const $ = _c(4);
  const data = usePromptOverlay();
  if (!data || data.suggestions.length === 0) {
    return null;
  }
  let t0;
  if ($[0] !== data.maxColumnWidth || $[1] !== data.selectedSuggestion || $[2] !== data.suggestions) {
    t0 = /* @__PURE__ */ jsx(Box, { position: "absolute", bottom: "100%", left: 0, right: 0, paddingX: 2, paddingTop: 1, flexDirection: "column", opaque: true, children: /* @__PURE__ */ jsx(PromptInputFooterSuggestions, { suggestions: data.suggestions, selectedSuggestion: data.selectedSuggestion, maxColumnWidth: data.maxColumnWidth, overlay: true }) });
    $[0] = data.maxColumnWidth;
    $[1] = data.selectedSuggestion;
    $[2] = data.suggestions;
    $[3] = t0;
  } else {
    t0 = $[3];
  }
  return t0;
}
function DialogOverlay() {
  const $ = _c(2);
  const node = usePromptOverlayDialog();
  if (!node) {
    return null;
  }
  let t0;
  if ($[0] !== node) {
    t0 = /* @__PURE__ */ jsx(Box, { position: "absolute", bottom: "100%", left: 0, right: 0, opaque: true, children: node });
    $[0] = node;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  return t0;
}
export {
  FullscreenLayout,
  ScrollChromeContext,
  computeUnseenDivider,
  countUnseenAssistantTurns,
  useUnseenDivider
};
