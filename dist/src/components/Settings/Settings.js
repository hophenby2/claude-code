import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Suspense, useState } from "react";
import { useKeybinding } from "../../keybindings/useKeybinding.js";
import { useExitOnCtrlCDWithKeybindings } from "../../hooks/useExitOnCtrlCDWithKeybindings.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { useIsInsideModal, useModalOrTerminalSize } from "../../context/modalContext.js";
import { Pane } from "../design-system/Pane.js";
import { Tabs, Tab } from "../design-system/Tabs.js";
import { Status, buildDiagnostics } from "./Status.js";
import { Config } from "./Config.js";
import { Usage } from "./Usage.js";
function Settings(t0) {
  const $ = _c(25);
  const {
    onClose,
    context,
    defaultTab
  } = t0;
  const [selectedTab, setSelectedTab] = useState(defaultTab);
  const [tabsHidden, setTabsHidden] = useState(false);
  const [configOwnsEsc, setConfigOwnsEsc] = useState(false);
  const [gatesOwnsEsc, setGatesOwnsEsc] = useState(false);
  const insideModal = useIsInsideModal();
  const {
    rows
  } = useModalOrTerminalSize(useTerminalSize());
  const contentHeight = insideModal ? rows + 1 : Math.max(15, Math.min(Math.floor(rows * 0.8), 30));
  const [diagnosticsPromise] = useState(_temp2);
  useExitOnCtrlCDWithKeybindings();
  let t1;
  if ($[0] !== onClose || $[1] !== tabsHidden) {
    t1 = () => {
      if (tabsHidden) {
        return;
      }
      onClose("Status dialog dismissed", {
        display: "system"
      });
    };
    $[0] = onClose;
    $[1] = tabsHidden;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  const handleEscape = t1;
  const t2 = !tabsHidden && !(selectedTab === "Config" && configOwnsEsc) && !(selectedTab === "Gates" && gatesOwnsEsc);
  let t3;
  if ($[3] !== t2) {
    t3 = {
      context: "Settings",
      isActive: t2
    };
    $[3] = t2;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  useKeybinding("confirm:no", handleEscape, t3);
  let t4;
  if ($[5] !== context || $[6] !== diagnosticsPromise) {
    t4 = /* @__PURE__ */ jsx(Tab, { title: "Status", children: /* @__PURE__ */ jsx(Status, { context, diagnosticsPromise }) }, "status");
    $[5] = context;
    $[6] = diagnosticsPromise;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  let t5;
  if ($[8] !== contentHeight || $[9] !== context || $[10] !== onClose) {
    t5 = /* @__PURE__ */ jsx(Tab, { title: "Config", children: /* @__PURE__ */ jsx(Suspense, { fallback: null, children: /* @__PURE__ */ jsx(Config, { context, onClose, setTabsHidden, onIsSearchModeChange: setConfigOwnsEsc, contentHeight }) }) }, "config");
    $[8] = contentHeight;
    $[9] = context;
    $[10] = onClose;
    $[11] = t5;
  } else {
    t5 = $[11];
  }
  let t6;
  if ($[12] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t6 = /* @__PURE__ */ jsx(Tab, { title: "Usage", children: /* @__PURE__ */ jsx(Usage, {}) }, "usage");
    $[12] = t6;
  } else {
    t6 = $[12];
  }
  let t7;
  if ($[13] !== contentHeight) {
    t7 = false ? [/* @__PURE__ */ jsx(Tab, { title: "Gates", children: /* @__PURE__ */ jsx(Gates, { onOwnsEscChange: setGatesOwnsEsc, contentHeight }) }, "gates")] : [];
    $[13] = contentHeight;
    $[14] = t7;
  } else {
    t7 = $[14];
  }
  let t8;
  if ($[15] !== t4 || $[16] !== t5 || $[17] !== t7) {
    t8 = [t4, t5, t6, ...t7];
    $[15] = t4;
    $[16] = t5;
    $[17] = t7;
    $[18] = t8;
  } else {
    t8 = $[18];
  }
  const tabs = t8;
  const t9 = defaultTab !== "Config" && defaultTab !== "Gates";
  const t10 = tabsHidden || insideModal ? void 0 : contentHeight;
  let t11;
  if ($[19] !== selectedTab || $[20] !== t10 || $[21] !== t9 || $[22] !== tabs || $[23] !== tabsHidden) {
    t11 = /* @__PURE__ */ jsx(Pane, { color: "permission", children: /* @__PURE__ */ jsx(Tabs, { color: "permission", selectedTab, onTabChange: setSelectedTab, hidden: tabsHidden, initialHeaderFocused: t9, contentHeight: t10, children: tabs }) });
    $[19] = selectedTab;
    $[20] = t10;
    $[21] = t9;
    $[22] = tabs;
    $[23] = tabsHidden;
    $[24] = t11;
  } else {
    t11 = $[24];
  }
  return t11;
}
function _temp2() {
  return buildDiagnostics().catch(_temp);
}
function _temp() {
  return [];
}
export {
  Settings
};
