import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { relative } from "path";
import { Suspense, use } from "react";
import { Box, NoSelect, Text } from "../../../ink.js";
import { intersperse } from "../../../utils/array.js";
import { getCwd } from "../../../utils/cwd.js";
import { getPatchForDisplay } from "../../../utils/diff.js";
import { getFsImplementation } from "../../../utils/fsOperations.js";
import { safeParseJSON } from "../../../utils/json.js";
import { parseCellId } from "../../../utils/notebook.js";
import { HighlightedCode } from "../../HighlightedCode.js";
import { StructuredDiff } from "../../StructuredDiff.js";
function NotebookEditToolDiff(props) {
  const $ = _c(5);
  let t0;
  if ($[0] !== props.notebook_path) {
    t0 = getFsImplementation().readFile(props.notebook_path, {
      encoding: "utf-8"
    }).then(_temp).catch(_temp2);
    $[0] = props.notebook_path;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  const notebookDataPromise = t0;
  let t1;
  if ($[2] !== notebookDataPromise || $[3] !== props) {
    t1 = /* @__PURE__ */ jsx(Suspense, { fallback: null, children: /* @__PURE__ */ jsx(NotebookEditToolDiffInner, { ...props, promise: notebookDataPromise }) });
    $[2] = notebookDataPromise;
    $[3] = props;
    $[4] = t1;
  } else {
    t1 = $[4];
  }
  return t1;
}
function _temp2() {
  return null;
}
function _temp(content) {
  return safeParseJSON(content);
}
function NotebookEditToolDiffInner(t0) {
  const $ = _c(34);
  const {
    notebook_path,
    cell_id,
    new_source,
    cell_type,
    edit_mode: t1,
    verbose,
    width,
    promise
  } = t0;
  const edit_mode = t1 === void 0 ? "replace" : t1;
  const notebookData = use(promise);
  let t2;
  if ($[0] !== cell_id || $[1] !== notebookData) {
    bb0: {
      if (!notebookData || !cell_id) {
        t2 = "";
        break bb0;
      }
      const cellIndex = parseCellId(cell_id);
      if (cellIndex !== void 0) {
        if (notebookData.cells[cellIndex]) {
          const source = notebookData.cells[cellIndex].source;
          let t33;
          if ($[3] !== source) {
            t33 = Array.isArray(source) ? source.join("") : source;
            $[3] = source;
            $[4] = t33;
          } else {
            t33 = $[4];
          }
          t2 = t33;
          break bb0;
        }
        t2 = "";
        break bb0;
      }
      let t32;
      if ($[5] !== cell_id) {
        t32 = (cell) => cell.id === cell_id;
        $[5] = cell_id;
        $[6] = t32;
      } else {
        t32 = $[6];
      }
      const cell_0 = notebookData.cells.find(t32);
      if (!cell_0) {
        t2 = "";
        break bb0;
      }
      t2 = Array.isArray(cell_0.source) ? cell_0.source.join("") : cell_0.source;
    }
    $[0] = cell_id;
    $[1] = notebookData;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  const oldSource = t2;
  let t3;
  bb1: {
    if (!notebookData || edit_mode === "insert" || edit_mode === "delete") {
      t3 = null;
      break bb1;
    }
    let t42;
    if ($[7] !== new_source || $[8] !== notebook_path || $[9] !== oldSource) {
      t42 = getPatchForDisplay({
        filePath: notebook_path,
        fileContents: oldSource,
        edits: [{
          old_string: oldSource,
          new_string: new_source,
          replace_all: false
        }],
        ignoreWhitespace: false
      });
      $[7] = new_source;
      $[8] = notebook_path;
      $[9] = oldSource;
      $[10] = t42;
    } else {
      t42 = $[10];
    }
    t3 = t42;
  }
  const hunks = t3;
  let editTypeDescription;
  bb2: switch (edit_mode) {
    case "insert": {
      editTypeDescription = "Insert new cell";
      break bb2;
    }
    case "delete": {
      editTypeDescription = "Delete cell";
      break bb2;
    }
    default: {
      editTypeDescription = "Replace cell contents";
    }
  }
  let t4;
  if ($[11] !== notebook_path || $[12] !== verbose) {
    t4 = verbose ? notebook_path : relative(getCwd(), notebook_path);
    $[11] = notebook_path;
    $[12] = verbose;
    $[13] = t4;
  } else {
    t4 = $[13];
  }
  let t5;
  if ($[14] !== t4) {
    t5 = /* @__PURE__ */ jsx(Text, { bold: true, children: t4 });
    $[14] = t4;
    $[15] = t5;
  } else {
    t5 = $[15];
  }
  const t6 = cell_type ? ` (${cell_type})` : "";
  let t7;
  if ($[16] !== cell_id || $[17] !== editTypeDescription || $[18] !== t6) {
    t7 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      editTypeDescription,
      " for cell ",
      cell_id,
      t6
    ] });
    $[16] = cell_id;
    $[17] = editTypeDescription;
    $[18] = t6;
    $[19] = t7;
  } else {
    t7 = $[19];
  }
  let t8;
  if ($[20] !== t5 || $[21] !== t7) {
    t8 = /* @__PURE__ */ jsxs(Box, { paddingBottom: 1, flexDirection: "column", children: [
      t5,
      t7
    ] });
    $[20] = t5;
    $[21] = t7;
    $[22] = t8;
  } else {
    t8 = $[22];
  }
  let t9;
  if ($[23] !== cell_type || $[24] !== edit_mode || $[25] !== hunks || $[26] !== new_source || $[27] !== notebook_path || $[28] !== oldSource || $[29] !== width) {
    t9 = edit_mode === "delete" ? /* @__PURE__ */ jsx(Box, { flexDirection: "column", paddingLeft: 2, children: /* @__PURE__ */ jsx(HighlightedCode, { code: oldSource, filePath: notebook_path }) }) : edit_mode === "insert" ? /* @__PURE__ */ jsx(Box, { flexDirection: "column", paddingLeft: 2, children: /* @__PURE__ */ jsx(HighlightedCode, { code: new_source, filePath: cell_type === "markdown" ? "file.md" : notebook_path }) }) : hunks ? intersperse(hunks.map((_) => /* @__PURE__ */ jsx(StructuredDiff, { patch: _, dim: false, width, filePath: notebook_path, firstLine: new_source.split("\n")[0] ?? null, fileContent: oldSource }, _.newStart)), _temp3) : /* @__PURE__ */ jsx(HighlightedCode, { code: new_source, filePath: cell_type === "markdown" ? "file.md" : notebook_path });
    $[23] = cell_type;
    $[24] = edit_mode;
    $[25] = hunks;
    $[26] = new_source;
    $[27] = notebook_path;
    $[28] = oldSource;
    $[29] = width;
    $[30] = t9;
  } else {
    t9 = $[30];
  }
  let t10;
  if ($[31] !== t8 || $[32] !== t9) {
    t10 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: /* @__PURE__ */ jsxs(Box, { borderStyle: "round", flexDirection: "column", paddingX: 1, children: [
      t8,
      t9
    ] }) });
    $[31] = t8;
    $[32] = t9;
    $[33] = t10;
  } else {
    t10 = $[33];
  }
  return t10;
}
function _temp3(i) {
  return /* @__PURE__ */ jsx(NoSelect, { fromLeftEdge: true, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "..." }) }, `ellipsis-${i}`);
}
export {
  NotebookEditToolDiff
};
