import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { COMMAND_MESSAGE_TAG } from "../../constants/xml.js";
import { Box, Text } from "../../ink.js";
import { extractTag } from "../../utils/messages.js";
function UserCommandMessage(t0) {
  const $ = _c(19);
  const {
    addMargin,
    param: t1
  } = t0;
  const {
    text
  } = t1;
  let t2;
  if ($[0] !== text) {
    t2 = extractTag(text, COMMAND_MESSAGE_TAG);
    $[0] = text;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  const commandMessage = t2;
  let t3;
  if ($[2] !== text) {
    t3 = extractTag(text, "command-args");
    $[2] = text;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  const args = t3;
  const isSkillFormat = extractTag(text, "skill-format") === "true";
  if (!commandMessage) {
    return null;
  }
  if (isSkillFormat) {
    const t42 = addMargin ? 1 : 0;
    let t52;
    if ($[4] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t52 = /* @__PURE__ */ jsxs(Text, { color: "subtle", children: [
        figures.pointer,
        " "
      ] });
      $[4] = t52;
    } else {
      t52 = $[4];
    }
    let t62;
    if ($[5] !== commandMessage) {
      t62 = /* @__PURE__ */ jsxs(Text, { children: [
        t52,
        /* @__PURE__ */ jsxs(Text, { color: "text", children: [
          "Skill(",
          commandMessage,
          ")"
        ] })
      ] });
      $[5] = commandMessage;
      $[6] = t62;
    } else {
      t62 = $[6];
    }
    let t72;
    if ($[7] !== t42 || $[8] !== t62) {
      t72 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginTop: t42, backgroundColor: "userMessageBackground", paddingRight: 1, children: t62 });
      $[7] = t42;
      $[8] = t62;
      $[9] = t72;
    } else {
      t72 = $[9];
    }
    return t72;
  }
  let t4;
  if ($[10] !== args || $[11] !== commandMessage) {
    t4 = [commandMessage, args].filter(Boolean);
    $[10] = args;
    $[11] = commandMessage;
    $[12] = t4;
  } else {
    t4 = $[12];
  }
  const content = `/${t4.join(" ")}`;
  const t5 = addMargin ? 1 : 0;
  let t6;
  if ($[13] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t6 = /* @__PURE__ */ jsxs(Text, { color: "subtle", children: [
      figures.pointer,
      " "
    ] });
    $[13] = t6;
  } else {
    t6 = $[13];
  }
  let t7;
  if ($[14] !== content) {
    t7 = /* @__PURE__ */ jsxs(Text, { children: [
      t6,
      /* @__PURE__ */ jsx(Text, { color: "text", children: content })
    ] });
    $[14] = content;
    $[15] = t7;
  } else {
    t7 = $[15];
  }
  let t8;
  if ($[16] !== t5 || $[17] !== t7) {
    t8 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginTop: t5, backgroundColor: "userMessageBackground", paddingRight: 1, children: t7 });
    $[16] = t5;
    $[17] = t7;
    $[18] = t8;
  } else {
    t8 = $[18];
  }
  return t8;
}
export {
  UserCommandMessage
};
