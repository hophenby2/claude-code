import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useEffect, useState } from "react";
import { useSearchInput } from "../../hooks/useSearchInput.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { clamp } from "../../ink/layout/geometry.js";
import { Box, Text, useTerminalFocus } from "../../ink.js";
import { SearchBox } from "../SearchBox.js";
import { Byline } from "./Byline.js";
import { KeyboardShortcutHint } from "./KeyboardShortcutHint.js";
import { ListItem } from "./ListItem.js";
import { Pane } from "./Pane.js";
const DEFAULT_VISIBLE = 8;
const CHROME_ROWS = 10;
const MIN_VISIBLE = 2;
function FuzzyPicker({
  title,
  placeholder = "Type to search\u2026",
  initialQuery,
  items,
  getKey,
  renderItem,
  renderPreview,
  previewPosition = "bottom",
  visibleCount: requestedVisible = DEFAULT_VISIBLE,
  direction = "down",
  onQueryChange,
  onSelect,
  onTab,
  onShiftTab,
  onFocus,
  onCancel,
  emptyMessage = "No results",
  matchLabel,
  selectAction = "select",
  extraHints
}) {
  const isTerminalFocused = useTerminalFocus();
  const {
    rows,
    columns
  } = useTerminalSize();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const visibleCount = Math.max(MIN_VISIBLE, Math.min(requestedVisible, rows - CHROME_ROWS - (matchLabel ? 1 : 0)));
  const compact = columns < 120;
  const step = (delta) => {
    setFocusedIndex((i) => clamp(i + delta, 0, items.length - 1));
  };
  const {
    query,
    cursorOffset
  } = useSearchInput({
    isActive: true,
    onExit: () => {
    },
    onCancel,
    initialQuery,
    backspaceExitsOnEmpty: false
  });
  const handleKeyDown = (e) => {
    if (e.key === "up" || e.ctrl && e.key === "p") {
      e.preventDefault();
      e.stopImmediatePropagation();
      step(direction === "up" ? 1 : -1);
      return;
    }
    if (e.key === "down" || e.ctrl && e.key === "n") {
      e.preventDefault();
      e.stopImmediatePropagation();
      step(direction === "up" ? -1 : 1);
      return;
    }
    if (e.key === "return") {
      e.preventDefault();
      e.stopImmediatePropagation();
      const selected = items[focusedIndex];
      if (selected) onSelect(selected);
      return;
    }
    if (e.key === "tab") {
      e.preventDefault();
      e.stopImmediatePropagation();
      const selected = items[focusedIndex];
      if (!selected) return;
      const tabAction = e.shift ? onShiftTab ?? onTab : onTab;
      if (tabAction) {
        tabAction.handler(selected);
      } else {
        onSelect(selected);
      }
    }
  };
  useEffect(() => {
    onQueryChange(query);
    setFocusedIndex(0);
  }, [query]);
  useEffect(() => {
    setFocusedIndex((i) => clamp(i, 0, items.length - 1));
  }, [items.length]);
  const focused = items[focusedIndex];
  useEffect(() => {
    onFocus?.(focused);
  }, [focused]);
  const windowStart = clamp(focusedIndex - visibleCount + 1, 0, items.length - visibleCount);
  const visible = items.slice(windowStart, windowStart + visibleCount);
  const emptyText = typeof emptyMessage === "function" ? emptyMessage(query) : emptyMessage;
  const searchBox = /* @__PURE__ */ jsx(SearchBox, { query, cursorOffset, placeholder, isFocused: true, isTerminalFocused });
  const listBlock = /* @__PURE__ */ jsx(List, { visible, windowStart, visibleCount, total: items.length, focusedIndex, direction, getKey, renderItem, emptyText });
  const preview = renderPreview && focused ? /* @__PURE__ */ jsx(Box, { flexDirection: "column", flexGrow: 1, children: renderPreview(focused) }) : null;
  const listGroup = renderPreview && previewPosition === "right" ? /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 2, height: visibleCount + (matchLabel ? 1 : 0), children: [
    /* @__PURE__ */ jsxs(Box, { flexDirection: "column", flexShrink: 0, children: [
      listBlock,
      matchLabel && /* @__PURE__ */ jsx(Text, { dimColor: true, children: matchLabel })
    ] }),
    preview ?? /* @__PURE__ */ jsx(Box, { flexGrow: 1 })
  ] }) : (
    // Box (not fragment) so the outer gap={1} doesn't insert a blank line
    // between list/matchLabel/preview — that read as extra space above the
    // prompt in direction='up'.
    /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      listBlock,
      matchLabel && /* @__PURE__ */ jsx(Text, { dimColor: true, children: matchLabel }),
      preview
    ] })
  );
  const inputAbove = direction !== "up";
  return /* @__PURE__ */ jsx(Pane, { color: "permission", children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, tabIndex: 0, autoFocus: true, onKeyDown: handleKeyDown, children: [
    /* @__PURE__ */ jsx(Text, { bold: true, color: "permission", children: title }),
    inputAbove && searchBox,
    listGroup,
    !inputAbove && searchBox,
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "\u2191/\u2193", action: compact ? "nav" : "navigate" }),
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: compact ? firstWord(selectAction) : selectAction }),
      onTab && /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Tab", action: onTab.action }),
      onShiftTab && !compact && /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "shift+tab", action: onShiftTab.action }),
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Esc", action: "cancel" }),
      extraHints
    ] }) })
  ] }) });
}
function List(t0) {
  const $ = _c(27);
  const {
    visible,
    windowStart,
    visibleCount,
    total,
    focusedIndex,
    direction,
    getKey,
    renderItem,
    emptyText
  } = t0;
  if (visible.length === 0) {
    let t12;
    if ($[0] !== emptyText) {
      t12 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: emptyText });
      $[0] = emptyText;
      $[1] = t12;
    } else {
      t12 = $[1];
    }
    let t22;
    if ($[2] !== t12 || $[3] !== visibleCount) {
      t22 = /* @__PURE__ */ jsx(Box, { height: visibleCount, flexShrink: 0, children: t12 });
      $[2] = t12;
      $[3] = visibleCount;
      $[4] = t22;
    } else {
      t22 = $[4];
    }
    return t22;
  }
  let t1;
  if ($[5] !== direction || $[6] !== focusedIndex || $[7] !== getKey || $[8] !== renderItem || $[9] !== total || $[10] !== visible || $[11] !== visibleCount || $[12] !== windowStart) {
    let t22;
    if ($[14] !== direction || $[15] !== focusedIndex || $[16] !== getKey || $[17] !== renderItem || $[18] !== total || $[19] !== visible.length || $[20] !== visibleCount || $[21] !== windowStart) {
      t22 = (item, i) => {
        const actualIndex = windowStart + i;
        const isFocused = actualIndex === focusedIndex;
        const atLowEdge = i === 0 && windowStart > 0;
        const atHighEdge = i === visible.length - 1 && windowStart + visibleCount < total;
        return /* @__PURE__ */ jsx(ListItem, { isFocused, showScrollUp: direction === "up" ? atHighEdge : atLowEdge, showScrollDown: direction === "up" ? atLowEdge : atHighEdge, styled: false, children: renderItem(item, isFocused) }, getKey(item));
      };
      $[14] = direction;
      $[15] = focusedIndex;
      $[16] = getKey;
      $[17] = renderItem;
      $[18] = total;
      $[19] = visible.length;
      $[20] = visibleCount;
      $[21] = windowStart;
      $[22] = t22;
    } else {
      t22 = $[22];
    }
    t1 = visible.map(t22);
    $[5] = direction;
    $[6] = focusedIndex;
    $[7] = getKey;
    $[8] = renderItem;
    $[9] = total;
    $[10] = visible;
    $[11] = visibleCount;
    $[12] = windowStart;
    $[13] = t1;
  } else {
    t1 = $[13];
  }
  const rows = t1;
  const t2 = direction === "up" ? "column-reverse" : "column";
  let t3;
  if ($[23] !== rows || $[24] !== t2 || $[25] !== visibleCount) {
    t3 = /* @__PURE__ */ jsx(Box, { height: visibleCount, flexShrink: 0, flexDirection: t2, children: rows });
    $[23] = rows;
    $[24] = t2;
    $[25] = visibleCount;
    $[26] = t3;
  } else {
    t3 = $[26];
  }
  return t3;
}
function firstWord(s) {
  const i = s.indexOf(" ");
  return i === -1 ? s : s.slice(0, i);
}
export {
  FuzzyPicker
};
