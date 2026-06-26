const OPEN_TO_CLOSE = {
  "`": "`",
  '"': '"',
  "<": ">",
  "{": "}",
  "[": "]",
  "(": ")",
  "'": "'"
};
function findKeywordTriggerPositions(text, keyword) {
  const re = new RegExp(keyword, "i");
  if (!re.test(text)) return [];
  if (text.startsWith("/")) return [];
  const quotedRanges = [];
  let openQuote = null;
  let openAt = 0;
  const isWord = (ch) => !!ch && /[\p{L}\p{N}_]/u.test(ch);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (openQuote) {
      if (openQuote === "[" && ch === "[") {
        openAt = i;
        continue;
      }
      if (ch !== OPEN_TO_CLOSE[openQuote]) continue;
      if (openQuote === "'" && isWord(text[i + 1])) continue;
      quotedRanges.push({ start: openAt, end: i + 1 });
      openQuote = null;
    } else if (ch === "<" && i + 1 < text.length && /[a-zA-Z/]/.test(text[i + 1]) || ch === "'" && !isWord(text[i - 1]) || ch !== "<" && ch !== "'" && ch in OPEN_TO_CLOSE) {
      openQuote = ch;
      openAt = i;
    }
  }
  const positions = [];
  const wordRe = new RegExp(`\\b${keyword}\\b`, "gi");
  const matches = text.matchAll(wordRe);
  for (const match of matches) {
    if (match.index === void 0) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (quotedRanges.some((r) => start >= r.start && start < r.end)) continue;
    const before = text[start - 1];
    const after = text[end];
    if (before === "/" || before === "\\" || before === "-") continue;
    if (after === "/" || after === "\\" || after === "-" || after === "?")
      continue;
    if (after === "." && isWord(text[end + 1])) continue;
    positions.push({ word: match[0], start, end });
  }
  return positions;
}
function findUltraplanTriggerPositions(text) {
  return findKeywordTriggerPositions(text, "ultraplan");
}
function findUltrareviewTriggerPositions(text) {
  return findKeywordTriggerPositions(text, "ultrareview");
}
function hasUltraplanKeyword(text) {
  return findUltraplanTriggerPositions(text).length > 0;
}
function hasUltrareviewKeyword(text) {
  return findUltrareviewTriggerPositions(text).length > 0;
}
function replaceUltraplanKeyword(text) {
  const [trigger] = findUltraplanTriggerPositions(text);
  if (!trigger) return text;
  const before = text.slice(0, trigger.start);
  const after = text.slice(trigger.end);
  if (!(before + after).trim()) return "";
  return before + trigger.word.slice("ultra".length) + after;
}
export {
  findUltraplanTriggerPositions,
  findUltrareviewTriggerPositions,
  hasUltraplanKeyword,
  hasUltrareviewKeyword,
  replaceUltraplanKeyword
};
