import { getMainLoopModel } from "./model/model.js";
const DOCUMENT_EXTENSIONS = /* @__PURE__ */ new Set(["pdf"]);
function parsePDFPageRange(pages) {
  const trimmed = pages.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.endsWith("-")) {
    const first2 = parseInt(trimmed.slice(0, -1), 10);
    if (isNaN(first2) || first2 < 1) {
      return null;
    }
    return { firstPage: first2, lastPage: Infinity };
  }
  const dashIndex = trimmed.indexOf("-");
  if (dashIndex === -1) {
    const page = parseInt(trimmed, 10);
    if (isNaN(page) || page < 1) {
      return null;
    }
    return { firstPage: page, lastPage: page };
  }
  const first = parseInt(trimmed.slice(0, dashIndex), 10);
  const last = parseInt(trimmed.slice(dashIndex + 1), 10);
  if (isNaN(first) || isNaN(last) || first < 1 || last < 1 || last < first) {
    return null;
  }
  return { firstPage: first, lastPage: last };
}
function isPDFSupported() {
  return !getMainLoopModel().toLowerCase().includes("claude-3-haiku");
}
function isPDFExtension(ext) {
  const normalized = ext.startsWith(".") ? ext.slice(1) : ext;
  return DOCUMENT_EXTENSIONS.has(normalized.toLowerCase());
}
export {
  DOCUMENT_EXTENSIONS,
  isPDFExtension,
  isPDFSupported,
  parsePDFPageRange
};
