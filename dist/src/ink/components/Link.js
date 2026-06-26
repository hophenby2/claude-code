import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { supportsHyperlinks } from "../supports-hyperlinks.js";
import Text from "./Text.js";
function Link(t0) {
  const $ = _c(5);
  const {
    children,
    url,
    fallback
  } = t0;
  const content = children ?? url;
  if (supportsHyperlinks()) {
    let t12;
    if ($[0] !== content || $[1] !== url) {
      t12 = /* @__PURE__ */ jsx(Text, { children: /* @__PURE__ */ jsx("ink-link", { href: url, children: content }) });
      $[0] = content;
      $[1] = url;
      $[2] = t12;
    } else {
      t12 = $[2];
    }
    return t12;
  }
  const t1 = fallback ?? content;
  let t2;
  if ($[3] !== t1) {
    t2 = /* @__PURE__ */ jsx(Text, { children: t1 });
    $[3] = t1;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  return t2;
}
export {
  Link as default
};
