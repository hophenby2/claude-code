import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { createContext, useContext, useEffect, useState } from "react";
import { useIsInsideModal, useModalScrollRef } from "../../context/modalContext.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import ScrollBox from "../../ink/components/ScrollBox.js";
import { stringWidth } from "../../ink/stringWidth.js";
import { Box, Text } from "../../ink.js";
import { useKeybindings } from "../../keybindings/useKeybinding.js";
const TabsContext = createContext({
  selectedTab: void 0,
  width: void 0,
  // Default for components rendered outside a Tabs (tests, standalone):
  // content has focus, focusHeader is a no-op.
  headerFocused: false,
  focusHeader: () => {
  },
  blurHeader: () => {
  },
  registerOptIn: () => () => {
  }
});
function Tabs(t0) {
  const $ = _c(25);
  const {
    title,
    color,
    defaultTab,
    children,
    hidden,
    useFullWidth,
    selectedTab: controlledSelectedTab,
    onTabChange,
    banner,
    disableNavigation,
    initialHeaderFocused: t1,
    contentHeight,
    navFromContent: t2
  } = t0;
  const initialHeaderFocused = t1 === void 0 ? true : t1;
  const navFromContent = t2 === void 0 ? false : t2;
  const {
    columns: terminalWidth
  } = useTerminalSize();
  const tabs = children.map(_temp);
  const defaultTabIndex = defaultTab ? tabs.findIndex((tab) => defaultTab === tab[0]) : 0;
  const isControlled = controlledSelectedTab !== void 0;
  const [internalSelectedTab, setInternalSelectedTab] = useState(defaultTabIndex !== -1 ? defaultTabIndex : 0);
  const controlledTabIndex = isControlled ? tabs.findIndex((tab_0) => tab_0[0] === controlledSelectedTab) : -1;
  const selectedTabIndex = isControlled ? controlledTabIndex !== -1 ? controlledTabIndex : 0 : internalSelectedTab;
  const modalScrollRef = useModalScrollRef();
  const [headerFocused, setHeaderFocused] = useState(initialHeaderFocused);
  let t3;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t3 = () => setHeaderFocused(true);
    $[0] = t3;
  } else {
    t3 = $[0];
  }
  const focusHeader = t3;
  let t4;
  if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t4 = () => setHeaderFocused(false);
    $[1] = t4;
  } else {
    t4 = $[1];
  }
  const blurHeader = t4;
  const [optInCount, setOptInCount] = useState(0);
  let t5;
  if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t5 = () => {
      setOptInCount(_temp2);
      return () => setOptInCount(_temp3);
    };
    $[2] = t5;
  } else {
    t5 = $[2];
  }
  const registerOptIn = t5;
  const optedIn = optInCount > 0;
  const handleTabChange = (offset) => {
    const newIndex = (selectedTabIndex + tabs.length + offset) % tabs.length;
    const newTabId = tabs[newIndex]?.[0];
    if (isControlled && onTabChange && newTabId) {
      onTabChange(newTabId);
    } else {
      setInternalSelectedTab(newIndex);
    }
    setHeaderFocused(true);
  };
  const t6 = !hidden && !disableNavigation && headerFocused;
  let t7;
  if ($[3] !== t6) {
    t7 = {
      context: "Tabs",
      isActive: t6
    };
    $[3] = t6;
    $[4] = t7;
  } else {
    t7 = $[4];
  }
  useKeybindings({
    "tabs:next": () => handleTabChange(1),
    "tabs:previous": () => handleTabChange(-1)
  }, t7);
  let t8;
  if ($[5] !== headerFocused || $[6] !== hidden || $[7] !== optedIn) {
    t8 = (e) => {
      if (!headerFocused || !optedIn || hidden) {
        return;
      }
      if (e.key === "down") {
        e.preventDefault();
        setHeaderFocused(false);
      }
    };
    $[5] = headerFocused;
    $[6] = hidden;
    $[7] = optedIn;
    $[8] = t8;
  } else {
    t8 = $[8];
  }
  const handleKeyDown = t8;
  const t9 = navFromContent && !headerFocused && optedIn && !hidden && !disableNavigation;
  let t10;
  if ($[9] !== t9) {
    t10 = {
      context: "Tabs",
      isActive: t9
    };
    $[9] = t9;
    $[10] = t10;
  } else {
    t10 = $[10];
  }
  useKeybindings({
    "tabs:next": () => {
      handleTabChange(1);
      setHeaderFocused(true);
    },
    "tabs:previous": () => {
      handleTabChange(-1);
      setHeaderFocused(true);
    }
  }, t10);
  const titleWidth = title ? stringWidth(title) + 1 : 0;
  const tabsWidth = tabs.reduce(_temp4, 0);
  const usedWidth = titleWidth + tabsWidth;
  const spacerWidth = useFullWidth ? Math.max(0, terminalWidth - usedWidth) : 0;
  const contentWidth = useFullWidth ? terminalWidth : void 0;
  const T0 = Box;
  const t11 = "column";
  const t12 = 0;
  const t13 = true;
  const t14 = modalScrollRef ? 0 : void 0;
  const t15 = !hidden && /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, flexShrink: modalScrollRef ? 0 : void 0, children: [
    title !== void 0 && /* @__PURE__ */ jsx(Text, { bold: true, color, children: title }),
    tabs.map((t16, i) => {
      const [id, title_0] = t16;
      const isCurrent = selectedTabIndex === i;
      const hasColorCursor = color && isCurrent && headerFocused;
      return /* @__PURE__ */ jsxs(Text, { backgroundColor: hasColorCursor ? color : void 0, color: hasColorCursor ? "inverseText" : void 0, inverse: isCurrent && !hasColorCursor, bold: isCurrent, children: [
        " ",
        title_0,
        " "
      ] }, id);
    }),
    spacerWidth > 0 && /* @__PURE__ */ jsx(Text, { children: " ".repeat(spacerWidth) })
  ] });
  let t17;
  if ($[11] !== children || $[12] !== contentHeight || $[13] !== contentWidth || $[14] !== hidden || $[15] !== modalScrollRef || $[16] !== selectedTabIndex) {
    t17 = modalScrollRef ? /* @__PURE__ */ jsx(Box, { width: contentWidth, marginTop: hidden ? 0 : 1, flexShrink: 0, children: /* @__PURE__ */ jsx(ScrollBox, { ref: modalScrollRef, flexDirection: "column", flexShrink: 0, children }, selectedTabIndex) }) : /* @__PURE__ */ jsx(Box, { width: contentWidth, marginTop: hidden ? 0 : 1, height: contentHeight, overflowY: contentHeight !== void 0 ? "hidden" : void 0, children });
    $[11] = children;
    $[12] = contentHeight;
    $[13] = contentWidth;
    $[14] = hidden;
    $[15] = modalScrollRef;
    $[16] = selectedTabIndex;
    $[17] = t17;
  } else {
    t17 = $[17];
  }
  let t18;
  if ($[18] !== T0 || $[19] !== banner || $[20] !== handleKeyDown || $[21] !== t14 || $[22] !== t15 || $[23] !== t17) {
    t18 = /* @__PURE__ */ jsxs(T0, { flexDirection: t11, tabIndex: t12, autoFocus: t13, onKeyDown: handleKeyDown, flexShrink: t14, children: [
      t15,
      banner,
      t17
    ] });
    $[18] = T0;
    $[19] = banner;
    $[20] = handleKeyDown;
    $[21] = t14;
    $[22] = t15;
    $[23] = t17;
    $[24] = t18;
  } else {
    t18 = $[24];
  }
  return /* @__PURE__ */ jsx(TabsContext.Provider, { value: {
    selectedTab: tabs[selectedTabIndex][0],
    width: contentWidth,
    headerFocused,
    focusHeader,
    blurHeader,
    registerOptIn
  }, children: t18 });
}
function _temp4(sum, t0) {
  const [, tabTitle] = t0;
  return sum + (tabTitle ? stringWidth(tabTitle) : 0) + 2 + 1;
}
function _temp3(n_0) {
  return n_0 - 1;
}
function _temp2(n) {
  return n + 1;
}
function _temp(child) {
  return [child.props.id ?? child.props.title, child.props.title];
}
function Tab(t0) {
  const $ = _c(4);
  const {
    title,
    id,
    children
  } = t0;
  const {
    selectedTab,
    width
  } = useContext(TabsContext);
  const insideModal = useIsInsideModal();
  if (selectedTab !== (id ?? title)) {
    return null;
  }
  const t1 = insideModal ? 0 : void 0;
  let t2;
  if ($[0] !== children || $[1] !== t1 || $[2] !== width) {
    t2 = /* @__PURE__ */ jsx(Box, { width, flexShrink: t1, children });
    $[0] = children;
    $[1] = t1;
    $[2] = width;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}
function useTabsWidth() {
  const {
    width
  } = useContext(TabsContext);
  return width;
}
function useTabHeaderFocus() {
  const $ = _c(6);
  const {
    headerFocused,
    focusHeader,
    blurHeader,
    registerOptIn
  } = useContext(TabsContext);
  let t0;
  if ($[0] !== registerOptIn) {
    t0 = [registerOptIn];
    $[0] = registerOptIn;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  useEffect(registerOptIn, t0);
  let t1;
  if ($[2] !== blurHeader || $[3] !== focusHeader || $[4] !== headerFocused) {
    t1 = {
      headerFocused,
      focusHeader,
      blurHeader
    };
    $[2] = blurHeader;
    $[3] = focusHeader;
    $[4] = headerFocused;
    $[5] = t1;
  } else {
    t1 = $[5];
  }
  return t1;
}
export {
  Tab,
  Tabs,
  useTabHeaderFocus,
  useTabsWidth
};
