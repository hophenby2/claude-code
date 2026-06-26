import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import { Box, Text } from "../../ink.js";
import { truncateStartToWidth } from "../../utils/format.js";
import { plural } from "../../utils/stringUtils.js";
const MAX_VISIBLE_FILES = 5;
function DiffFileList(t0) {
  const $ = _c(36);
  const {
    files,
    selectedIndex
  } = t0;
  const {
    columns
  } = useTerminalSize();
  let t1;
  bb0: {
    if (files.length === 0 || files.length <= MAX_VISIBLE_FILES) {
      let t23;
      if ($[0] !== files.length) {
        t23 = {
          startIndex: 0,
          endIndex: files.length
        };
        $[0] = files.length;
        $[1] = t23;
      } else {
        t23 = $[1];
      }
      t1 = t23;
      break bb0;
    }
    let start = Math.max(0, selectedIndex - Math.floor(MAX_VISIBLE_FILES / 2));
    let end = start + MAX_VISIBLE_FILES;
    if (end > files.length) {
      end = files.length;
      start = Math.max(0, end - MAX_VISIBLE_FILES);
    }
    let t22;
    if ($[2] !== end || $[3] !== start) {
      t22 = {
        startIndex: start,
        endIndex: end
      };
      $[2] = end;
      $[3] = start;
      $[4] = t22;
    } else {
      t22 = $[4];
    }
    t1 = t22;
  }
  const {
    startIndex,
    endIndex
  } = t1;
  if (files.length === 0) {
    let t22;
    if ($[5] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t22 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: "No changed files" });
      $[5] = t22;
    } else {
      t22 = $[5];
    }
    return t22;
  }
  let T0;
  let hasMoreBelow;
  let needsPagination;
  let t2;
  let t3;
  let t4;
  if ($[6] !== columns || $[7] !== endIndex || $[8] !== files || $[9] !== selectedIndex || $[10] !== startIndex) {
    const visibleFiles = files.slice(startIndex, endIndex);
    const hasMoreAbove = startIndex > 0;
    hasMoreBelow = endIndex < files.length;
    needsPagination = files.length > MAX_VISIBLE_FILES;
    const maxPathWidth = Math.max(20, columns - 16 - 3 - 4);
    T0 = Box;
    t2 = "column";
    if ($[17] !== hasMoreAbove || $[18] !== needsPagination || $[19] !== startIndex) {
      t3 = needsPagination && /* @__PURE__ */ jsx(Text, { dimColor: true, children: hasMoreAbove ? ` \u2191 ${startIndex} more ${plural(startIndex, "file")}` : " " });
      $[17] = hasMoreAbove;
      $[18] = needsPagination;
      $[19] = startIndex;
      $[20] = t3;
    } else {
      t3 = $[20];
    }
    let t52;
    if ($[21] !== maxPathWidth || $[22] !== selectedIndex || $[23] !== startIndex) {
      t52 = (file, index) => /* @__PURE__ */ jsx(FileItem, { file, isSelected: startIndex + index === selectedIndex, maxPathWidth }, file.path);
      $[21] = maxPathWidth;
      $[22] = selectedIndex;
      $[23] = startIndex;
      $[24] = t52;
    } else {
      t52 = $[24];
    }
    t4 = visibleFiles.map(t52);
    $[6] = columns;
    $[7] = endIndex;
    $[8] = files;
    $[9] = selectedIndex;
    $[10] = startIndex;
    $[11] = T0;
    $[12] = hasMoreBelow;
    $[13] = needsPagination;
    $[14] = t2;
    $[15] = t3;
    $[16] = t4;
  } else {
    T0 = $[11];
    hasMoreBelow = $[12];
    needsPagination = $[13];
    t2 = $[14];
    t3 = $[15];
    t4 = $[16];
  }
  let t5;
  if ($[25] !== endIndex || $[26] !== files.length || $[27] !== hasMoreBelow || $[28] !== needsPagination) {
    t5 = needsPagination && /* @__PURE__ */ jsx(Text, { dimColor: true, children: hasMoreBelow ? ` \u2193 ${files.length - endIndex} more ${plural(files.length - endIndex, "file")}` : " " });
    $[25] = endIndex;
    $[26] = files.length;
    $[27] = hasMoreBelow;
    $[28] = needsPagination;
    $[29] = t5;
  } else {
    t5 = $[29];
  }
  let t6;
  if ($[30] !== T0 || $[31] !== t2 || $[32] !== t3 || $[33] !== t4 || $[34] !== t5) {
    t6 = /* @__PURE__ */ jsxs(T0, { flexDirection: t2, children: [
      t3,
      t4,
      t5
    ] });
    $[30] = T0;
    $[31] = t2;
    $[32] = t3;
    $[33] = t4;
    $[34] = t5;
    $[35] = t6;
  } else {
    t6 = $[35];
  }
  return t6;
}
function FileItem(t0) {
  const $ = _c(14);
  const {
    file,
    isSelected,
    maxPathWidth
  } = t0;
  let t1;
  if ($[0] !== file.path || $[1] !== maxPathWidth) {
    t1 = truncateStartToWidth(file.path, maxPathWidth);
    $[0] = file.path;
    $[1] = maxPathWidth;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  const displayPath = t1;
  const pointer = isSelected ? figures.pointer + " " : "  ";
  const line = `${pointer}${displayPath}`;
  const t2 = isSelected ? "background" : void 0;
  let t3;
  if ($[3] !== isSelected || $[4] !== line || $[5] !== t2) {
    t3 = /* @__PURE__ */ jsx(Text, { bold: isSelected, color: t2, inverse: isSelected, children: line });
    $[3] = isSelected;
    $[4] = line;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t4 = /* @__PURE__ */ jsx(Box, { flexGrow: 1 });
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  let t5;
  if ($[8] !== file || $[9] !== isSelected) {
    t5 = /* @__PURE__ */ jsx(FileStats, { file, isSelected });
    $[8] = file;
    $[9] = isSelected;
    $[10] = t5;
  } else {
    t5 = $[10];
  }
  let t6;
  if ($[11] !== t3 || $[12] !== t5) {
    t6 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
      t3,
      t4,
      t5
    ] });
    $[11] = t3;
    $[12] = t5;
    $[13] = t6;
  } else {
    t6 = $[13];
  }
  return t6;
}
function FileStats(t0) {
  const $ = _c(20);
  const {
    file,
    isSelected
  } = t0;
  if (file.isUntracked) {
    const t12 = !isSelected;
    let t22;
    if ($[0] !== t12) {
      t22 = /* @__PURE__ */ jsx(Text, { dimColor: t12, italic: true, children: "untracked" });
      $[0] = t12;
      $[1] = t22;
    } else {
      t22 = $[1];
    }
    return t22;
  }
  if (file.isBinary) {
    const t12 = !isSelected;
    let t22;
    if ($[2] !== t12) {
      t22 = /* @__PURE__ */ jsx(Text, { dimColor: t12, italic: true, children: "Binary file" });
      $[2] = t12;
      $[3] = t22;
    } else {
      t22 = $[3];
    }
    return t22;
  }
  if (file.isLargeFile) {
    const t12 = !isSelected;
    let t22;
    if ($[4] !== t12) {
      t22 = /* @__PURE__ */ jsx(Text, { dimColor: t12, italic: true, children: "Large file modified" });
      $[4] = t12;
      $[5] = t22;
    } else {
      t22 = $[5];
    }
    return t22;
  }
  let t1;
  if ($[6] !== file.linesAdded || $[7] !== isSelected) {
    t1 = file.linesAdded > 0 && /* @__PURE__ */ jsxs(Text, { color: "diffAddedWord", bold: isSelected, children: [
      "+",
      file.linesAdded
    ] });
    $[6] = file.linesAdded;
    $[7] = isSelected;
    $[8] = t1;
  } else {
    t1 = $[8];
  }
  const t2 = file.linesAdded > 0 && file.linesRemoved > 0 && " ";
  let t3;
  if ($[9] !== file.linesRemoved || $[10] !== isSelected) {
    t3 = file.linesRemoved > 0 && /* @__PURE__ */ jsxs(Text, { color: "diffRemovedWord", bold: isSelected, children: [
      "-",
      file.linesRemoved
    ] });
    $[9] = file.linesRemoved;
    $[10] = isSelected;
    $[11] = t3;
  } else {
    t3 = $[11];
  }
  let t4;
  if ($[12] !== file.isTruncated || $[13] !== isSelected) {
    t4 = file.isTruncated && /* @__PURE__ */ jsx(Text, { dimColor: !isSelected, children: " (truncated)" });
    $[12] = file.isTruncated;
    $[13] = isSelected;
    $[14] = t4;
  } else {
    t4 = $[14];
  }
  let t5;
  if ($[15] !== t1 || $[16] !== t2 || $[17] !== t3 || $[18] !== t4) {
    t5 = /* @__PURE__ */ jsxs(Text, { children: [
      t1,
      t2,
      t3,
      t4
    ] });
    $[15] = t1;
    $[16] = t2;
    $[17] = t3;
    $[18] = t4;
    $[19] = t5;
  } else {
    t5 = $[19];
  }
  return t5;
}
export {
  DiffFileList
};
