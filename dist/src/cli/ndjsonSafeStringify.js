import { jsonStringify } from "../utils/slowOperations.js";
const JS_LINE_TERMINATORS = /\u2028|\u2029/g;
function escapeJsLineTerminators(json) {
  return json.replace(
    JS_LINE_TERMINATORS,
    (c) => c === "\u2028" ? "\\u2028" : "\\u2029"
  );
}
function ndjsonSafeStringify(value) {
  return escapeJsLineTerminators(jsonStringify(value));
}
export {
  ndjsonSafeStringify
};
