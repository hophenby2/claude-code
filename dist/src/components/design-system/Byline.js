import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import React, { Children, isValidElement } from "react";
import { Text } from "../../ink.js";
function Byline(t0) {
  const $ = _c(5);
  const {
    children
  } = t0;
  let t1;
  let t2;
  if ($[0] !== children) {
    t2 = /* @__PURE__ */ Symbol.for("react.early_return_sentinel");
    bb0: {
      const validChildren = Children.toArray(children);
      if (validChildren.length === 0) {
        t2 = null;
        break bb0;
      }
      t1 = validChildren.map(_temp);
    }
    $[0] = children;
    $[1] = t1;
    $[2] = t2;
  } else {
    t1 = $[1];
    t2 = $[2];
  }
  if (t2 !== /* @__PURE__ */ Symbol.for("react.early_return_sentinel")) {
    return t2;
  }
  let t3;
  if ($[3] !== t1) {
    t3 = /* @__PURE__ */ jsx(Fragment, { children: t1 });
    $[3] = t1;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  return t3;
}
function _temp(child, index) {
  return /* @__PURE__ */ jsxs(React.Fragment, { children: [
    index > 0 && /* @__PURE__ */ jsx(Text, { dimColor: true, children: " \xB7 " }),
    child
  ] }, isValidElement(child) ? child.key ?? index : index);
}
export {
  Byline
};
