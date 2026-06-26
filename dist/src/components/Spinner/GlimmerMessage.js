import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { stringWidth } from "../../ink/stringWidth.js";
import { Text, useTheme } from "../../ink.js";
import { getGraphemeSegmenter } from "../../utils/intl.js";
import { getTheme } from "../../utils/theme.js";
import { interpolateColor, parseRGB, toRGBColor } from "./utils.js";
const ERROR_RED = {
  r: 171,
  g: 43,
  b: 63
};
function GlimmerMessage(t0) {
  const $ = _c(75);
  const {
    message,
    mode,
    messageColor,
    glimmerIndex,
    flashOpacity,
    shimmerColor,
    stalledIntensity: t1
  } = t0;
  const stalledIntensity = t1 === void 0 ? 0 : t1;
  const [themeName] = useTheme();
  let messageWidth;
  let segments;
  let t2;
  if ($[0] !== flashOpacity || $[1] !== message || $[2] !== messageColor || $[3] !== mode || $[4] !== shimmerColor || $[5] !== stalledIntensity || $[6] !== themeName) {
    t2 = /* @__PURE__ */ Symbol.for("react.early_return_sentinel");
    bb0: {
      const theme = getTheme(themeName);
      let segs;
      if ($[10] !== message) {
        segs = [];
        for (const {
          segment
        } of getGraphemeSegmenter().segment(message)) {
          segs.push({
            segment,
            width: stringWidth(segment)
          });
        }
        $[10] = message;
        $[11] = segs;
      } else {
        segs = $[11];
      }
      let t32;
      if ($[12] !== message) {
        t32 = stringWidth(message);
        $[12] = message;
        $[13] = t32;
      } else {
        t32 = $[13];
      }
      let t42;
      if ($[14] !== segs || $[15] !== t32) {
        t42 = {
          segments: segs,
          messageWidth: t32
        };
        $[14] = segs;
        $[15] = t32;
        $[16] = t42;
      } else {
        t42 = $[16];
      }
      ({
        segments,
        messageWidth
      } = t42);
      if (!message) {
        t2 = null;
        break bb0;
      }
      if (stalledIntensity > 0) {
        const baseColorStr = theme[messageColor];
        const baseRGB = baseColorStr ? parseRGB(baseColorStr) : null;
        if (baseRGB) {
          const interpolated = interpolateColor(baseRGB, ERROR_RED, stalledIntensity);
          const color = toRGBColor(interpolated);
          let t53;
          if ($[17] !== color) {
            t53 = /* @__PURE__ */ jsx(Text, { color, children: " " });
            $[17] = color;
            $[18] = t53;
          } else {
            t53 = $[18];
          }
          t2 = /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Text, { color, children: message }),
            t53
          ] });
          break bb0;
        }
        const color_0 = stalledIntensity > 0.5 ? "error" : messageColor;
        let t52;
        if ($[19] !== color_0 || $[20] !== message) {
          t52 = /* @__PURE__ */ jsx(Text, { color: color_0, children: message });
          $[19] = color_0;
          $[20] = message;
          $[21] = t52;
        } else {
          t52 = $[21];
        }
        let t62;
        if ($[22] !== color_0) {
          t62 = /* @__PURE__ */ jsx(Text, { color: color_0, children: " " });
          $[22] = color_0;
          $[23] = t62;
        } else {
          t62 = $[23];
        }
        let t72;
        if ($[24] !== t52 || $[25] !== t62) {
          t72 = /* @__PURE__ */ jsxs(Fragment, { children: [
            t52,
            t62
          ] });
          $[24] = t52;
          $[25] = t62;
          $[26] = t72;
        } else {
          t72 = $[26];
        }
        t2 = t72;
        break bb0;
      }
      if (mode === "tool-use") {
        const baseColorStr_0 = theme[messageColor];
        const shimmerColorStr = theme[shimmerColor];
        const baseRGB_0 = baseColorStr_0 ? parseRGB(baseColorStr_0) : null;
        const shimmerRGB = shimmerColorStr ? parseRGB(shimmerColorStr) : null;
        if (baseRGB_0 && shimmerRGB) {
          const interpolated_0 = interpolateColor(baseRGB_0, shimmerRGB, flashOpacity);
          const t53 = /* @__PURE__ */ jsx(Text, { color: toRGBColor(interpolated_0), children: message });
          let t63;
          if ($[27] !== messageColor) {
            t63 = /* @__PURE__ */ jsx(Text, { color: messageColor, children: " " });
            $[27] = messageColor;
            $[28] = t63;
          } else {
            t63 = $[28];
          }
          let t73;
          if ($[29] !== t53 || $[30] !== t63) {
            t73 = /* @__PURE__ */ jsxs(Fragment, { children: [
              t53,
              t63
            ] });
            $[29] = t53;
            $[30] = t63;
            $[31] = t73;
          } else {
            t73 = $[31];
          }
          t2 = t73;
          break bb0;
        }
        const color_1 = flashOpacity > 0.5 ? shimmerColor : messageColor;
        let t52;
        if ($[32] !== color_1 || $[33] !== message) {
          t52 = /* @__PURE__ */ jsx(Text, { color: color_1, children: message });
          $[32] = color_1;
          $[33] = message;
          $[34] = t52;
        } else {
          t52 = $[34];
        }
        let t62;
        if ($[35] !== messageColor) {
          t62 = /* @__PURE__ */ jsx(Text, { color: messageColor, children: " " });
          $[35] = messageColor;
          $[36] = t62;
        } else {
          t62 = $[36];
        }
        let t72;
        if ($[37] !== t52 || $[38] !== t62) {
          t72 = /* @__PURE__ */ jsxs(Fragment, { children: [
            t52,
            t62
          ] });
          $[37] = t52;
          $[38] = t62;
          $[39] = t72;
        } else {
          t72 = $[39];
        }
        t2 = t72;
        break bb0;
      }
    }
    $[0] = flashOpacity;
    $[1] = message;
    $[2] = messageColor;
    $[3] = mode;
    $[4] = shimmerColor;
    $[5] = stalledIntensity;
    $[6] = themeName;
    $[7] = messageWidth;
    $[8] = segments;
    $[9] = t2;
  } else {
    messageWidth = $[7];
    segments = $[8];
    t2 = $[9];
  }
  if (t2 !== /* @__PURE__ */ Symbol.for("react.early_return_sentinel")) {
    return t2;
  }
  const shimmerStart = glimmerIndex - 1;
  const shimmerEnd = glimmerIndex + 1;
  if (shimmerStart >= messageWidth || shimmerEnd < 0) {
    let t32;
    if ($[40] !== message || $[41] !== messageColor) {
      t32 = /* @__PURE__ */ jsx(Text, { color: messageColor, children: message });
      $[40] = message;
      $[41] = messageColor;
      $[42] = t32;
    } else {
      t32 = $[42];
    }
    let t42;
    if ($[43] !== messageColor) {
      t42 = /* @__PURE__ */ jsx(Text, { color: messageColor, children: " " });
      $[43] = messageColor;
      $[44] = t42;
    } else {
      t42 = $[44];
    }
    let t52;
    if ($[45] !== t32 || $[46] !== t42) {
      t52 = /* @__PURE__ */ jsxs(Fragment, { children: [
        t32,
        t42
      ] });
      $[45] = t32;
      $[46] = t42;
      $[47] = t52;
    } else {
      t52 = $[47];
    }
    return t52;
  }
  const clampedStart = Math.max(0, shimmerStart);
  let colPos = 0;
  let before = "";
  let shim = "";
  let after = "";
  if ($[48] !== after || $[49] !== before || $[50] !== clampedStart || $[51] !== colPos || $[52] !== segments || $[53] !== shim || $[54] !== shimmerEnd) {
    for (const {
      segment: segment_0,
      width
    } of segments) {
      if (colPos + width <= clampedStart) {
        before = before + segment_0;
      } else {
        if (colPos > shimmerEnd) {
          after = after + segment_0;
        } else {
          shim = shim + segment_0;
        }
      }
      colPos = colPos + width;
    }
    $[48] = after;
    $[49] = before;
    $[50] = clampedStart;
    $[51] = colPos;
    $[52] = segments;
    $[53] = shim;
    $[54] = shimmerEnd;
    $[55] = before;
    $[56] = after;
    $[57] = shim;
    $[58] = colPos;
  } else {
    before = $[55];
    after = $[56];
    shim = $[57];
    colPos = $[58];
  }
  let t3;
  if ($[59] !== before || $[60] !== messageColor) {
    t3 = before && /* @__PURE__ */ jsx(Text, { color: messageColor, children: before });
    $[59] = before;
    $[60] = messageColor;
    $[61] = t3;
  } else {
    t3 = $[61];
  }
  let t4;
  if ($[62] !== shim || $[63] !== shimmerColor) {
    t4 = /* @__PURE__ */ jsx(Text, { color: shimmerColor, children: shim });
    $[62] = shim;
    $[63] = shimmerColor;
    $[64] = t4;
  } else {
    t4 = $[64];
  }
  let t5;
  if ($[65] !== after || $[66] !== messageColor) {
    t5 = after && /* @__PURE__ */ jsx(Text, { color: messageColor, children: after });
    $[65] = after;
    $[66] = messageColor;
    $[67] = t5;
  } else {
    t5 = $[67];
  }
  let t6;
  if ($[68] !== messageColor) {
    t6 = /* @__PURE__ */ jsx(Text, { color: messageColor, children: " " });
    $[68] = messageColor;
    $[69] = t6;
  } else {
    t6 = $[69];
  }
  let t7;
  if ($[70] !== t3 || $[71] !== t4 || $[72] !== t5 || $[73] !== t6) {
    t7 = /* @__PURE__ */ jsxs(Fragment, { children: [
      t3,
      t4,
      t5,
      t6
    ] });
    $[70] = t3;
    $[71] = t4;
    $[72] = t5;
    $[73] = t6;
    $[74] = t7;
  } else {
    t7 = $[74];
  }
  return t7;
}
export {
  GlimmerMessage
};
