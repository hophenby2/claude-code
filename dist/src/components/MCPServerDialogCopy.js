import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { Link, Text } from "../ink.js";
function MCPServerDialogCopy() {
  const $ = _c(1);
  let t0;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t0 = /* @__PURE__ */ jsxs(Text, { children: [
      "MCP servers may execute code or access system resources. All tool calls require approval. Learn more in the",
      " ",
      /* @__PURE__ */ jsx(Link, { url: "https://code.claude.com/docs/en/mcp", children: "MCP documentation" }),
      "."
    ] });
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  return t0;
}
export {
  MCPServerDialogCopy
};
