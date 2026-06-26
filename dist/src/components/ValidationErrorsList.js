import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import setWith from "lodash-es/setWith.js";
import { Box, Text, useTheme } from "../ink.js";
import { treeify } from "../utils/treeify.js";
function buildNestedTree(errors) {
  const tree = {};
  errors.forEach((error) => {
    if (!error.path) {
      tree[""] = error.message;
      return;
    }
    const pathParts = error.path.split(".");
    let modifiedPath = error.path;
    if (error.invalidValue !== null && error.invalidValue !== void 0 && pathParts.length > 0) {
      const newPathParts = [];
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        if (!part) continue;
        const numericPart = parseInt(part, 10);
        if (!isNaN(numericPart) && i === pathParts.length - 1) {
          let displayValue;
          if (typeof error.invalidValue === "string") {
            displayValue = `"${error.invalidValue}"`;
          } else if (error.invalidValue === null) {
            displayValue = "null";
          } else if (error.invalidValue === void 0) {
            displayValue = "undefined";
          } else {
            displayValue = String(error.invalidValue);
          }
          newPathParts.push(displayValue);
        } else {
          newPathParts.push(part);
        }
      }
      modifiedPath = newPathParts.join(".");
    }
    setWith(tree, modifiedPath, error.message, Object);
  });
  return tree;
}
function ValidationErrorsList(t0) {
  const $ = _c(9);
  const {
    errors
  } = t0;
  const [themeName] = useTheme();
  if (errors.length === 0) {
    return null;
  }
  let T0;
  let t1;
  let t2;
  if ($[0] !== errors || $[1] !== themeName) {
    const errorsByFile = errors.reduce(_temp, {});
    const sortedFiles = Object.keys(errorsByFile).sort();
    T0 = Box;
    t1 = "column";
    t2 = sortedFiles.map((file_0) => {
      const fileErrors = errorsByFile[file_0] || [];
      fileErrors.sort(_temp2);
      const errorTree = buildNestedTree(fileErrors);
      const suggestionPairs = /* @__PURE__ */ new Map();
      fileErrors.forEach((error_0) => {
        if (error_0.suggestion || error_0.docLink) {
          const key = `${error_0.suggestion || ""}|${error_0.docLink || ""}`;
          if (!suggestionPairs.has(key)) {
            suggestionPairs.set(key, {
              suggestion: error_0.suggestion,
              docLink: error_0.docLink
            });
          }
        }
      });
      const treeOutput = treeify(errorTree, {
        showValues: true,
        themeName,
        treeCharColors: {
          treeChar: "inactive",
          key: "text",
          value: "inactive"
        }
      });
      return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        /* @__PURE__ */ jsx(Text, { children: file_0 }),
        /* @__PURE__ */ jsx(Box, { marginLeft: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: treeOutput }) }),
        suggestionPairs.size > 0 && /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginTop: 1, children: Array.from(suggestionPairs.values()).map(_temp3) })
      ] }, file_0);
    });
    $[0] = errors;
    $[1] = themeName;
    $[2] = T0;
    $[3] = t1;
    $[4] = t2;
  } else {
    T0 = $[2];
    t1 = $[3];
    t2 = $[4];
  }
  let t3;
  if ($[5] !== T0 || $[6] !== t1 || $[7] !== t2) {
    t3 = /* @__PURE__ */ jsx(T0, { flexDirection: t1, children: t2 });
    $[5] = T0;
    $[6] = t1;
    $[7] = t2;
    $[8] = t3;
  } else {
    t3 = $[8];
  }
  return t3;
}
function _temp3(pair, index) {
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [
    pair.suggestion && /* @__PURE__ */ jsx(Text, { dimColor: true, wrap: "wrap", children: pair.suggestion }),
    pair.docLink && /* @__PURE__ */ jsxs(Text, { dimColor: true, wrap: "wrap", children: [
      "Learn more: ",
      pair.docLink
    ] })
  ] }, `suggestion-pair-${index}`);
}
function _temp2(a, b) {
  if (!a.path && b.path) {
    return -1;
  }
  if (a.path && !b.path) {
    return 1;
  }
  return (a.path || "").localeCompare(b.path || "");
}
function _temp(acc, error) {
  const file = error.file || "(file not specified)";
  if (!acc[file]) {
    acc[file] = [];
  }
  acc[file].push(error);
  return acc;
}
export {
  ValidationErrorsList
};
