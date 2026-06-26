import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { GITHUB_ACTION_SETUP_DOCS_URL } from "../../constants/github-app.js";
import { Box, Text } from "../../ink.js";
import { useKeybinding } from "../../keybindings/useKeybinding.js";
function InstallAppStep(t0) {
  const $ = _c(12);
  const {
    repoUrl,
    onSubmit
  } = t0;
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = {
      context: "Confirmation"
    };
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  useKeybinding("confirm:yes", onSubmit, t1);
  let t2;
  if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { bold: true, children: "Install the Claude GitHub App" }) });
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  let t3;
  if ($[2] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t3 = /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { children: "Opening browser to install the Claude GitHub App\u2026" }) });
    $[2] = t3;
  } else {
    t3 = $[2];
  }
  let t4;
  if ($[3] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t4 = /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { children: "If your browser doesn't open automatically, visit:" }) });
    $[3] = t4;
  } else {
    t4 = $[3];
  }
  let t5;
  if ($[4] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t5 = /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { underline: true, children: "https://github.com/apps/claude" }) });
    $[4] = t5;
  } else {
    t5 = $[4];
  }
  let t6;
  if ($[5] !== repoUrl) {
    t6 = /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsxs(Text, { children: [
      "Please install the app for repository: ",
      /* @__PURE__ */ jsx(Text, { bold: true, children: repoUrl })
    ] }) });
    $[5] = repoUrl;
    $[6] = t6;
  } else {
    t6 = $[6];
  }
  let t7;
  if ($[7] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t7 = /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Important: Make sure to grant access to this specific repository" }) });
    $[7] = t7;
  } else {
    t7 = $[7];
  }
  let t8;
  if ($[8] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t8 = /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(Text, { bold: true, color: "permission", children: [
      "Press Enter once you've installed the app",
      figures.ellipsis
    ] }) });
    $[8] = t8;
  } else {
    t8 = $[8];
  }
  let t9;
  if ($[9] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t9 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "Having trouble? See manual setup instructions at:",
      " ",
      /* @__PURE__ */ jsx(Text, { color: "claude", children: GITHUB_ACTION_SETUP_DOCS_URL })
    ] }) });
    $[9] = t9;
  } else {
    t9 = $[9];
  }
  let t10;
  if ($[10] !== t6) {
    t10 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", borderStyle: "round", borderDimColor: true, paddingX: 1, children: [
      t2,
      t3,
      t4,
      t5,
      t6,
      t7,
      t8,
      t9
    ] });
    $[10] = t6;
    $[11] = t10;
  } else {
    t10 = $[11];
  }
  return t10;
}
export {
  InstallAppStep
};
