import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { useContext } from "react";
import { useQueuedMessage } from "../../context/QueuedMessageContext.js";
import { Box, Text } from "../../ink.js";
import { formatBriefTimestamp } from "../../utils/formatBriefTimestamp.js";
import { findThinkingTriggerPositions, getRainbowColor, isUltrathinkEnabled } from "../../utils/thinking.js";
import { MessageActionsSelectedContext } from "../messageActions.js";
function HighlightedThinkingText(t0) {
  const $ = _c(31);
  const {
    text,
    useBriefLayout,
    timestamp
  } = t0;
  const isQueued = useQueuedMessage()?.isQueued ?? false;
  const isSelected = useContext(MessageActionsSelectedContext);
  const pointerColor = isSelected ? "suggestion" : "subtle";
  if (useBriefLayout) {
    let t12;
    if ($[0] !== timestamp) {
      t12 = timestamp ? formatBriefTimestamp(timestamp) : "";
      $[0] = timestamp;
      $[1] = t12;
    } else {
      t12 = $[1];
    }
    const ts = t12;
    const t22 = isQueued ? "subtle" : "briefLabelYou";
    let t32;
    if ($[2] !== t22) {
      t32 = /* @__PURE__ */ jsx(Text, { color: t22, children: "You" });
      $[2] = t22;
      $[3] = t32;
    } else {
      t32 = $[3];
    }
    let t4;
    if ($[4] !== ts) {
      t4 = ts ? /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        " ",
        ts
      ] }) : null;
      $[4] = ts;
      $[5] = t4;
    } else {
      t4 = $[5];
    }
    let t5;
    if ($[6] !== t32 || $[7] !== t4) {
      t5 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
        t32,
        t4
      ] });
      $[6] = t32;
      $[7] = t4;
      $[8] = t5;
    } else {
      t5 = $[8];
    }
    const t6 = isQueued ? "subtle" : "text";
    let t7;
    if ($[9] !== t6 || $[10] !== text) {
      t7 = /* @__PURE__ */ jsx(Text, { color: t6, children: text });
      $[9] = t6;
      $[10] = text;
      $[11] = t7;
    } else {
      t7 = $[11];
    }
    let t8;
    if ($[12] !== t5 || $[13] !== t7) {
      t8 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingLeft: 2, children: [
        t5,
        t7
      ] });
      $[12] = t5;
      $[13] = t7;
      $[14] = t8;
    } else {
      t8 = $[14];
    }
    return t8;
  }
  let parts;
  let t1;
  if ($[15] !== pointerColor || $[16] !== text) {
    t1 = /* @__PURE__ */ Symbol.for("react.early_return_sentinel");
    bb0: {
      const triggers = isUltrathinkEnabled() ? findThinkingTriggerPositions(text) : [];
      if (triggers.length === 0) {
        let t22;
        if ($[19] !== pointerColor) {
          t22 = /* @__PURE__ */ jsxs(Text, { color: pointerColor, children: [
            figures.pointer,
            " "
          ] });
          $[19] = pointerColor;
          $[20] = t22;
        } else {
          t22 = $[20];
        }
        let t32;
        if ($[21] !== text) {
          t32 = /* @__PURE__ */ jsx(Text, { color: "text", children: text });
          $[21] = text;
          $[22] = t32;
        } else {
          t32 = $[22];
        }
        let t4;
        if ($[23] !== t22 || $[24] !== t32) {
          t4 = /* @__PURE__ */ jsxs(Text, { children: [
            t22,
            t32
          ] });
          $[23] = t22;
          $[24] = t32;
          $[25] = t4;
        } else {
          t4 = $[25];
        }
        t1 = t4;
        break bb0;
      }
      parts = [];
      let cursor = 0;
      for (const t of triggers) {
        if (t.start > cursor) {
          parts.push(/* @__PURE__ */ jsx(Text, { color: "text", children: text.slice(cursor, t.start) }, `plain-${cursor}`));
        }
        for (let i = t.start; i < t.end; i++) {
          parts.push(/* @__PURE__ */ jsx(Text, { color: getRainbowColor(i - t.start), children: text[i] }, `rb-${i}`));
        }
        cursor = t.end;
      }
      if (cursor < text.length) {
        parts.push(/* @__PURE__ */ jsx(Text, { color: "text", children: text.slice(cursor) }, `plain-${cursor}`));
      }
    }
    $[15] = pointerColor;
    $[16] = text;
    $[17] = parts;
    $[18] = t1;
  } else {
    parts = $[17];
    t1 = $[18];
  }
  if (t1 !== /* @__PURE__ */ Symbol.for("react.early_return_sentinel")) {
    return t1;
  }
  let t2;
  if ($[26] !== pointerColor) {
    t2 = /* @__PURE__ */ jsxs(Text, { color: pointerColor, children: [
      figures.pointer,
      " "
    ] });
    $[26] = pointerColor;
    $[27] = t2;
  } else {
    t2 = $[27];
  }
  let t3;
  if ($[28] !== parts || $[29] !== t2) {
    t3 = /* @__PURE__ */ jsxs(Text, { children: [
      t2,
      parts
    ] });
    $[28] = parts;
    $[29] = t2;
    $[30] = t3;
  } else {
    t3 = $[30];
  }
  return t3;
}
export {
  HighlightedThinkingText
};
