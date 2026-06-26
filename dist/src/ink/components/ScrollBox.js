import { jsx } from "react/jsx-runtime";
import { useImperativeHandle, useRef, useState } from "react";
import { markScrollActivity } from "../../bootstrap/state.js";
import { markDirty, scheduleRenderFrom } from "../dom.js";
import { markCommitStart } from "../reconciler.js";
import Box from "./Box.js";
function ScrollBox({
  children,
  ref,
  stickyScroll,
  ...style
}) {
  const domRef = useRef(null);
  const [, forceRender] = useState(0);
  const listenersRef = useRef(/* @__PURE__ */ new Set());
  const renderQueuedRef = useRef(false);
  const notify = () => {
    for (const l of listenersRef.current) l();
  };
  function scrollMutated(el) {
    markScrollActivity();
    markDirty(el);
    markCommitStart();
    notify();
    if (renderQueuedRef.current) return;
    renderQueuedRef.current = true;
    queueMicrotask(() => {
      renderQueuedRef.current = false;
      scheduleRenderFrom(el);
    });
  }
  useImperativeHandle(
    ref,
    () => ({
      scrollTo(y) {
        const el = domRef.current;
        if (!el) return;
        el.stickyScroll = false;
        el.pendingScrollDelta = void 0;
        el.scrollAnchor = void 0;
        el.scrollTop = Math.max(0, Math.floor(y));
        scrollMutated(el);
      },
      scrollToElement(el, offset = 0) {
        const box = domRef.current;
        if (!box) return;
        box.stickyScroll = false;
        box.pendingScrollDelta = void 0;
        box.scrollAnchor = {
          el,
          offset
        };
        scrollMutated(box);
      },
      scrollBy(dy) {
        const el = domRef.current;
        if (!el) return;
        el.stickyScroll = false;
        el.scrollAnchor = void 0;
        el.pendingScrollDelta = (el.pendingScrollDelta ?? 0) + Math.floor(dy);
        scrollMutated(el);
      },
      scrollToBottom() {
        const el = domRef.current;
        if (!el) return;
        el.pendingScrollDelta = void 0;
        el.stickyScroll = true;
        markDirty(el);
        notify();
        forceRender((n) => n + 1);
      },
      getScrollTop() {
        return domRef.current?.scrollTop ?? 0;
      },
      getPendingDelta() {
        return domRef.current?.pendingScrollDelta ?? 0;
      },
      getScrollHeight() {
        return domRef.current?.scrollHeight ?? 0;
      },
      getFreshScrollHeight() {
        const content = domRef.current?.childNodes[0];
        return content?.yogaNode?.getComputedHeight() ?? domRef.current?.scrollHeight ?? 0;
      },
      getViewportHeight() {
        return domRef.current?.scrollViewportHeight ?? 0;
      },
      getViewportTop() {
        return domRef.current?.scrollViewportTop ?? 0;
      },
      isSticky() {
        const el = domRef.current;
        if (!el) return false;
        return el.stickyScroll ?? Boolean(el.attributes["stickyScroll"]);
      },
      subscribe(listener) {
        listenersRef.current.add(listener);
        return () => listenersRef.current.delete(listener);
      },
      setClampBounds(min, max) {
        const el = domRef.current;
        if (!el) return;
        el.scrollClampMin = min;
        el.scrollClampMax = max;
      }
    }),
    // notify/scrollMutated are inline (no useCallback) but only close over
    // refs + imports — stable. Empty deps avoids rebuilding the handle on
    // every render (which re-registers the ref = churn).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  return /* @__PURE__ */ jsx("ink-box", { ref: (el) => {
    domRef.current = el;
    if (el) el.scrollTop ??= 0;
  }, style: {
    flexWrap: "nowrap",
    flexDirection: style.flexDirection ?? "row",
    flexGrow: style.flexGrow ?? 0,
    flexShrink: style.flexShrink ?? 1,
    ...style,
    overflowX: "scroll",
    overflowY: "scroll"
  }, ...stickyScroll ? {
    stickyScroll: true
  } : {}, children: /* @__PURE__ */ jsx(Box, { flexDirection: "column", flexGrow: 1, flexShrink: 0, width: "100%", children }) });
}
var ScrollBox_default = ScrollBox;
export {
  ScrollBox_default as default
};
