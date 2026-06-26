import { Fragment, jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
const feature = (_name) => false;
import { useEffect } from "react";
import { useNotifications } from "../context/notifications.js";
import { Text } from "../ink.js";
import { getGlobalConfig } from "../utils/config.js";
import { getRainbowColor } from "../utils/thinking.js";
function isBuddyTeaserWindow() {
  if (false) return true;
  const d = /* @__PURE__ */ new Date();
  return d.getFullYear() === 2026 && d.getMonth() === 3 && d.getDate() <= 7;
}
function isBuddyLive() {
  if (false) return true;
  const d = /* @__PURE__ */ new Date();
  return d.getFullYear() > 2026 || d.getFullYear() === 2026 && d.getMonth() >= 3;
}
function RainbowText(t0) {
  const $ = _c(2);
  const {
    text
  } = t0;
  let t1;
  if ($[0] !== text) {
    t1 = /* @__PURE__ */ jsx(Fragment, { children: [...text].map(_temp) });
    $[0] = text;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}
function _temp(ch, i) {
  return /* @__PURE__ */ jsx(Text, { color: getRainbowColor(i), children: ch }, i);
}
function useBuddyNotification() {
  const $ = _c(4);
  const {
    addNotification,
    removeNotification
  } = useNotifications();
  let t0;
  let t1;
  if ($[0] !== addNotification || $[1] !== removeNotification) {
    t0 = () => {
      if (true) {
        return;
      }
      const config = getGlobalConfig();
      if (config.companion || !isBuddyTeaserWindow()) {
        return;
      }
      addNotification({
        key: "buddy-teaser",
        jsx: /* @__PURE__ */ jsx(RainbowText, { text: "/buddy" }),
        priority: "immediate",
        timeoutMs: 15e3
      });
      return () => removeNotification("buddy-teaser");
    };
    t1 = [addNotification, removeNotification];
    $[0] = addNotification;
    $[1] = removeNotification;
    $[2] = t0;
    $[3] = t1;
  } else {
    t0 = $[2];
    t1 = $[3];
  }
  useEffect(t0, t1);
}
function findBuddyTriggerPositions(text) {
  if (true) return [];
  const triggers = [];
  const re = /\/buddy\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    triggers.push({
      start: m.index,
      end: m.index + m[0].length
    });
  }
  return triggers;
}
export {
  findBuddyTriggerPositions,
  isBuddyLive,
  isBuddyTeaserWindow,
  useBuddyNotification
};
