import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Text } from "../../ink.js";
const BLOCKS = [" ", "\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589", "\u2588"];
function ProgressBar(t0) {
  const $ = _c(13);
  const {
    ratio: inputRatio,
    width,
    fillColor,
    emptyColor
  } = t0;
  const ratio = Math.min(1, Math.max(0, inputRatio));
  const whole = Math.floor(ratio * width);
  let t1;
  if ($[0] !== whole) {
    t1 = BLOCKS[BLOCKS.length - 1].repeat(whole);
    $[0] = whole;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let segments;
  if ($[2] !== ratio || $[3] !== t1 || $[4] !== whole || $[5] !== width) {
    segments = [t1];
    if (whole < width) {
      const remainder = ratio * width - whole;
      const middle = Math.floor(remainder * BLOCKS.length);
      segments.push(BLOCKS[middle]);
      const empty = width - whole - 1;
      if (empty > 0) {
        let t22;
        if ($[7] !== empty) {
          t22 = BLOCKS[0].repeat(empty);
          $[7] = empty;
          $[8] = t22;
        } else {
          t22 = $[8];
        }
        segments.push(t22);
      }
    }
    $[2] = ratio;
    $[3] = t1;
    $[4] = whole;
    $[5] = width;
    $[6] = segments;
  } else {
    segments = $[6];
  }
  const t2 = segments.join("");
  let t3;
  if ($[9] !== emptyColor || $[10] !== fillColor || $[11] !== t2) {
    t3 = /* @__PURE__ */ jsx(Text, { color: fillColor, backgroundColor: emptyColor, children: t2 });
    $[9] = emptyColor;
    $[10] = fillColor;
    $[11] = t2;
    $[12] = t3;
  } else {
    t3 = $[12];
  }
  return t3;
}
export {
  ProgressBar
};
