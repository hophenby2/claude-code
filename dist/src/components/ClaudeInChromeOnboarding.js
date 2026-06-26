import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import React from "react";
import { logEvent } from "../services/analytics/index.js";
import { Box, Link, Newline, Text, useInput } from "../ink.js";
import { isChromeExtensionInstalled } from "../utils/claudeInChrome/setup.js";
import { saveGlobalConfig } from "../utils/config.js";
import { Dialog } from "./design-system/Dialog.js";
const CHROME_EXTENSION_URL = "https://claude.ai/chrome";
const CHROME_PERMISSIONS_URL = "https://clau.de/chrome/permissions";
function ClaudeInChromeOnboarding(t0) {
  const $ = _c(20);
  const {
    onDone
  } = t0;
  const [isExtensionInstalled, setIsExtensionInstalled] = React.useState(false);
  let t1;
  let t2;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => {
      logEvent("tengu_claude_in_chrome_onboarding_shown", {});
      isChromeExtensionInstalled().then(setIsExtensionInstalled);
      saveGlobalConfig(_temp);
    };
    t2 = [];
    $[0] = t1;
    $[1] = t2;
  } else {
    t1 = $[0];
    t2 = $[1];
  }
  React.useEffect(t1, t2);
  let t3;
  if ($[2] !== onDone) {
    t3 = (_input, key) => {
      if (key.return) {
        onDone();
      }
    };
    $[2] = onDone;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  useInput(t3);
  let t4;
  if ($[4] !== isExtensionInstalled) {
    t4 = !isExtensionInstalled && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Newline, {}),
      /* @__PURE__ */ jsx(Newline, {}),
      "Requires the Chrome extension. Get started at",
      " ",
      /* @__PURE__ */ jsx(Link, { url: CHROME_EXTENSION_URL })
    ] });
    $[4] = isExtensionInstalled;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  let t5;
  if ($[6] !== t4) {
    t5 = /* @__PURE__ */ jsxs(Text, { children: [
      "Claude in Chrome works with the Chrome extension to let you control your browser directly from Claude Code. You can navigate websites, fill forms, capture screenshots, record GIFs, and debug with console logs and network requests.",
      t4
    ] });
    $[6] = t4;
    $[7] = t5;
  } else {
    t5 = $[7];
  }
  let t6;
  if ($[8] !== isExtensionInstalled) {
    t6 = isExtensionInstalled && /* @__PURE__ */ jsxs(Fragment, { children: [
      " ",
      "(",
      /* @__PURE__ */ jsx(Link, { url: CHROME_PERMISSIONS_URL }),
      ")"
    ] });
    $[8] = isExtensionInstalled;
    $[9] = t6;
  } else {
    t6 = $[9];
  }
  let t7;
  if ($[10] !== t6) {
    t7 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "Site-level permissions are inherited from the Chrome extension. Manage permissions in the Chrome extension settings to control which sites Claude can browse, click, and type on",
      t6,
      "."
    ] });
    $[10] = t6;
    $[11] = t7;
  } else {
    t7 = $[11];
  }
  let t8;
  if ($[12] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t8 = /* @__PURE__ */ jsx(Text, { bold: true, color: "chromeYellow", children: "/chrome" });
    $[12] = t8;
  } else {
    t8 = $[12];
  }
  let t9;
  if ($[13] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t9 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "For more info, use",
      " ",
      t8,
      " ",
      "or visit ",
      /* @__PURE__ */ jsx(Link, { url: "https://code.claude.com/docs/en/chrome" })
    ] });
    $[13] = t9;
  } else {
    t9 = $[13];
  }
  let t10;
  if ($[14] !== t5 || $[15] !== t7) {
    t10 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
      t5,
      t7,
      t9
    ] });
    $[14] = t5;
    $[15] = t7;
    $[16] = t10;
  } else {
    t10 = $[16];
  }
  let t11;
  if ($[17] !== onDone || $[18] !== t10) {
    t11 = /* @__PURE__ */ jsx(Dialog, { title: "Claude in Chrome (Beta)", onCancel: onDone, color: "chromeYellow", children: t10 });
    $[17] = onDone;
    $[18] = t10;
    $[19] = t11;
  } else {
    t11 = $[19];
  }
  return t11;
}
function _temp(current) {
  return {
    ...current,
    hasCompletedClaudeInChromeOnboarding: true
  };
}
export {
  ClaudeInChromeOnboarding
};
