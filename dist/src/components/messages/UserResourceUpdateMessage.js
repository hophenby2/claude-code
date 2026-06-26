import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { REFRESH_ARROW } from "../../constants/figures.js";
import { Box, Text } from "../../ink.js";
function parseUpdates(text) {
  const updates = [];
  const resourceRegex = /<mcp-resource-update\s+server="([^"]+)"\s+uri="([^"]+)"[^>]*>(?:[\s\S]*?<reason>([^<]+)<\/reason>)?/g;
  let match;
  while ((match = resourceRegex.exec(text)) !== null) {
    updates.push({
      kind: "resource",
      server: match[1] ?? "",
      target: match[2] ?? "",
      reason: match[3]
    });
  }
  const pollingRegex = /<mcp-polling-update\s+type="([^"]+)"\s+server="([^"]+)"\s+tool="([^"]+)"[^>]*>(?:[\s\S]*?<reason>([^<]+)<\/reason>)?/g;
  while ((match = pollingRegex.exec(text)) !== null) {
    updates.push({
      kind: "polling",
      server: match[2] ?? "",
      target: match[3] ?? "",
      reason: match[4]
    });
  }
  return updates;
}
function formatUri(uri) {
  if (uri.startsWith("file://")) {
    const path = uri.slice(7);
    const parts = path.split("/");
    return parts[parts.length - 1] || path;
  }
  if (uri.length > 40) {
    return uri.slice(0, 39) + "\u2026";
  }
  return uri;
}
function UserResourceUpdateMessage(t0) {
  const $ = _c(12);
  const {
    addMargin,
    param: t1
  } = t0;
  const {
    text
  } = t1;
  let T0;
  let t2;
  let t3;
  let t4;
  let t5;
  if ($[0] !== addMargin || $[1] !== text) {
    t5 = /* @__PURE__ */ Symbol.for("react.early_return_sentinel");
    bb0: {
      const updates = parseUpdates(text);
      if (updates.length === 0) {
        t5 = null;
        break bb0;
      }
      T0 = Box;
      t2 = "column";
      t3 = addMargin ? 1 : 0;
      t4 = updates.map(_temp);
    }
    $[0] = addMargin;
    $[1] = text;
    $[2] = T0;
    $[3] = t2;
    $[4] = t3;
    $[5] = t4;
    $[6] = t5;
  } else {
    T0 = $[2];
    t2 = $[3];
    t3 = $[4];
    t4 = $[5];
    t5 = $[6];
  }
  if (t5 !== /* @__PURE__ */ Symbol.for("react.early_return_sentinel")) {
    return t5;
  }
  let t6;
  if ($[7] !== T0 || $[8] !== t2 || $[9] !== t3 || $[10] !== t4) {
    t6 = /* @__PURE__ */ jsx(T0, { flexDirection: t2, marginTop: t3, children: t4 });
    $[7] = T0;
    $[8] = t2;
    $[9] = t3;
    $[10] = t4;
    $[11] = t6;
  } else {
    t6 = $[11];
  }
  return t6;
}
function _temp(update, i) {
  return /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { children: [
    /* @__PURE__ */ jsx(Text, { color: "success", children: REFRESH_ARROW }),
    " ",
    /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      update.server,
      ":"
    ] }),
    " ",
    /* @__PURE__ */ jsx(Text, { color: "suggestion", children: update.kind === "resource" ? formatUri(update.target) : update.target }),
    update.reason && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      " \xB7 ",
      update.reason
    ] })
  ] }) }, i);
}
export {
  UserResourceUpdateMessage
};
