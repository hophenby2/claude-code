import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { resolve } from "path";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { Box, Text } from "../../ink.js";
import { getCwd } from "../../utils/cwd.js";
import { readFileSafe } from "../../utils/file.js";
import { Divider } from "../design-system/Divider.js";
import { StructuredDiff } from "../StructuredDiff.js";
function DiffDetailView(t0) {
  const $ = _c(53);
  const {
    filePath,
    hunks,
    isLargeFile,
    isBinary,
    isTruncated,
    isUntracked
  } = t0;
  const {
    columns
  } = useTerminalSize();
  let t1;
  bb0: {
    if (!filePath) {
      let t23;
      if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t23 = {
          firstLine: null,
          fileContent: void 0
        };
        $[0] = t23;
      } else {
        t23 = $[0];
      }
      t1 = t23;
      break bb0;
    }
    let content;
    let t22;
    if ($[1] !== filePath) {
      const fullPath = resolve(getCwd(), filePath);
      content = readFileSafe(fullPath);
      t22 = content?.split("\n")[0] ?? null;
      $[1] = filePath;
      $[2] = content;
      $[3] = t22;
    } else {
      content = $[2];
      t22 = $[3];
    }
    const t32 = content ?? void 0;
    let t42;
    if ($[4] !== t22 || $[5] !== t32) {
      t42 = {
        firstLine: t22,
        fileContent: t32
      };
      $[4] = t22;
      $[5] = t32;
      $[6] = t42;
    } else {
      t42 = $[6];
    }
    t1 = t42;
  }
  const {
    firstLine,
    fileContent
  } = t1;
  if (isUntracked) {
    let t22;
    if ($[7] !== filePath) {
      t22 = /* @__PURE__ */ jsx(Text, { bold: true, children: filePath });
      $[7] = filePath;
      $[8] = t22;
    } else {
      t22 = $[8];
    }
    let t32;
    if ($[9] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t32 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: " (untracked)" });
      $[9] = t32;
    } else {
      t32 = $[9];
    }
    let t42;
    if ($[10] !== t22) {
      t42 = /* @__PURE__ */ jsxs(Box, { children: [
        t22,
        t32
      ] });
      $[10] = t22;
      $[11] = t42;
    } else {
      t42 = $[11];
    }
    let t52;
    if ($[12] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t52 = /* @__PURE__ */ jsx(Divider, { padding: 4 });
      $[12] = t52;
    } else {
      t52 = $[12];
    }
    let t62;
    if ($[13] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t62 = /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: "New file not yet staged." });
      $[13] = t62;
    } else {
      t62 = $[13];
    }
    let t72;
    if ($[14] !== filePath) {
      t72 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        t62,
        /* @__PURE__ */ jsxs(Text, { dimColor: true, italic: true, children: [
          "Run `git add ",
          filePath,
          "` to see line counts."
        ] })
      ] });
      $[14] = filePath;
      $[15] = t72;
    } else {
      t72 = $[15];
    }
    let t82;
    if ($[16] !== t42 || $[17] !== t72) {
      t82 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width: "100%", children: [
        t42,
        t52,
        t72
      ] });
      $[16] = t42;
      $[17] = t72;
      $[18] = t82;
    } else {
      t82 = $[18];
    }
    return t82;
  }
  if (isBinary) {
    let t22;
    if ($[19] !== filePath) {
      t22 = /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { bold: true, children: filePath }) });
      $[19] = filePath;
      $[20] = t22;
    } else {
      t22 = $[20];
    }
    let t32;
    if ($[21] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t32 = /* @__PURE__ */ jsx(Divider, { padding: 4 });
      $[21] = t32;
    } else {
      t32 = $[21];
    }
    let t42;
    if ($[22] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t42 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: "Binary file - cannot display diff" }) });
      $[22] = t42;
    } else {
      t42 = $[22];
    }
    let t52;
    if ($[23] !== t22) {
      t52 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width: "100%", children: [
        t22,
        t32,
        t42
      ] });
      $[23] = t22;
      $[24] = t52;
    } else {
      t52 = $[24];
    }
    return t52;
  }
  if (isLargeFile) {
    let t22;
    if ($[25] !== filePath) {
      t22 = /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { bold: true, children: filePath }) });
      $[25] = filePath;
      $[26] = t22;
    } else {
      t22 = $[26];
    }
    let t32;
    if ($[27] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t32 = /* @__PURE__ */ jsx(Divider, { padding: 4 });
      $[27] = t32;
    } else {
      t32 = $[27];
    }
    let t42;
    if ($[28] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t42 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: "Large file - diff exceeds 1 MB limit" }) });
      $[28] = t42;
    } else {
      t42 = $[28];
    }
    let t52;
    if ($[29] !== t22) {
      t52 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width: "100%", children: [
        t22,
        t32,
        t42
      ] });
      $[29] = t22;
      $[30] = t52;
    } else {
      t52 = $[30];
    }
    return t52;
  }
  let t2;
  if ($[31] !== filePath) {
    t2 = /* @__PURE__ */ jsx(Text, { bold: true, children: filePath });
    $[31] = filePath;
    $[32] = t2;
  } else {
    t2 = $[32];
  }
  let t3;
  if ($[33] !== isTruncated) {
    t3 = isTruncated && /* @__PURE__ */ jsx(Text, { dimColor: true, children: " (truncated)" });
    $[33] = isTruncated;
    $[34] = t3;
  } else {
    t3 = $[34];
  }
  let t4;
  if ($[35] !== t2 || $[36] !== t3) {
    t4 = /* @__PURE__ */ jsxs(Box, { children: [
      t2,
      t3
    ] });
    $[35] = t2;
    $[36] = t3;
    $[37] = t4;
  } else {
    t4 = $[37];
  }
  let t5;
  if ($[38] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t5 = /* @__PURE__ */ jsx(Divider, { padding: 4 });
    $[38] = t5;
  } else {
    t5 = $[38];
  }
  let t6;
  if ($[39] !== columns || $[40] !== fileContent || $[41] !== filePath || $[42] !== firstLine || $[43] !== hunks) {
    t6 = hunks.length === 0 ? /* @__PURE__ */ jsx(Text, { dimColor: true, children: "No diff content" }) : hunks.map((hunk, index) => /* @__PURE__ */ jsx(StructuredDiff, { patch: hunk, filePath, firstLine, fileContent, dim: false, width: columns - 2 - 2 }, index));
    $[39] = columns;
    $[40] = fileContent;
    $[41] = filePath;
    $[42] = firstLine;
    $[43] = hunks;
    $[44] = t6;
  } else {
    t6 = $[44];
  }
  let t7;
  if ($[45] !== t6) {
    t7 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: t6 });
    $[45] = t6;
    $[46] = t7;
  } else {
    t7 = $[46];
  }
  let t8;
  if ($[47] !== isTruncated) {
    t8 = isTruncated && /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: "\u2026 diff truncated (exceeded 400 line limit)" });
    $[47] = isTruncated;
    $[48] = t8;
  } else {
    t8 = $[48];
  }
  let t9;
  if ($[49] !== t4 || $[50] !== t7 || $[51] !== t8) {
    t9 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width: "100%", children: [
      t4,
      t5,
      t7,
      t8
    ] });
    $[49] = t4;
    $[50] = t7;
    $[51] = t8;
    $[52] = t9;
  } else {
    t9 = $[52];
  }
  return t9;
}
export {
  DiffDetailView
};
