import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
function RawAnsi(t0) {
  const $ = _c(6);
  const {
    lines,
    width
  } = t0;
  if (lines.length === 0) {
    return null;
  }
  let t1;
  if ($[0] !== lines) {
    t1 = lines.join("\n");
    $[0] = lines;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== lines.length || $[3] !== t1 || $[4] !== width) {
    t2 = /* @__PURE__ */ jsx("ink-raw-ansi", { rawText: t1, rawWidth: width, rawHeight: lines.length });
    $[2] = lines.length;
    $[3] = t1;
    $[4] = width;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  return t2;
}
export {
  RawAnsi
};
