let graphemeSegmenter = null;
let wordSegmenter = null;
function getGraphemeSegmenter() {
  if (!graphemeSegmenter) {
    graphemeSegmenter = new Intl.Segmenter(void 0, {
      granularity: "grapheme"
    });
  }
  return graphemeSegmenter;
}
function firstGrapheme(text) {
  if (!text) return "";
  const segments = getGraphemeSegmenter().segment(text);
  const first = segments[Symbol.iterator]().next().value;
  return first?.segment ?? "";
}
function lastGrapheme(text) {
  if (!text) return "";
  let last = "";
  for (const { segment } of getGraphemeSegmenter().segment(text)) {
    last = segment;
  }
  return last;
}
function getWordSegmenter() {
  if (!wordSegmenter) {
    wordSegmenter = new Intl.Segmenter(void 0, { granularity: "word" });
  }
  return wordSegmenter;
}
const rtfCache = /* @__PURE__ */ new Map();
function getRelativeTimeFormat(style, numeric) {
  const key = `${style}:${numeric}`;
  let rtf = rtfCache.get(key);
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat("en", { style, numeric });
    rtfCache.set(key, rtf);
  }
  return rtf;
}
let cachedTimeZone = null;
function getTimeZone() {
  if (!cachedTimeZone) {
    cachedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return cachedTimeZone;
}
let cachedSystemLocaleLanguage = null;
function getSystemLocaleLanguage() {
  if (cachedSystemLocaleLanguage === null) {
    try {
      const locale = Intl.DateTimeFormat().resolvedOptions().locale;
      cachedSystemLocaleLanguage = new Intl.Locale(locale).language;
    } catch {
      cachedSystemLocaleLanguage = void 0;
    }
  }
  return cachedSystemLocaleLanguage;
}
export {
  firstGrapheme,
  getGraphemeSegmenter,
  getRelativeTimeFormat,
  getSystemLocaleLanguage,
  getTimeZone,
  getWordSegmenter,
  lastGrapheme
};
