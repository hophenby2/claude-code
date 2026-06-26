import { Fragment, jsx } from "react/jsx-runtime";
import { Text } from "../ink.js";
function highlightMatch(text, query) {
  if (!query) return text;
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  const parts = [];
  let offset = 0;
  let idx = textLower.indexOf(queryLower, offset);
  if (idx === -1) return text;
  while (idx !== -1) {
    if (idx > offset) parts.push(text.slice(offset, idx));
    parts.push(/* @__PURE__ */ jsx(Text, { inverse: true, children: text.slice(idx, idx + query.length) }, idx));
    offset = idx + query.length;
    idx = textLower.indexOf(queryLower, offset);
  }
  if (offset < text.length) parts.push(text.slice(offset));
  return /* @__PURE__ */ jsx(Fragment, { children: parts });
}
export {
  highlightMatch
};
