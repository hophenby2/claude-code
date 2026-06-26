import emojiRegex from "emoji-regex";
import { eastAsianWidth } from "get-east-asian-width";
import stripAnsi from "strip-ansi";
import { getGraphemeSegmenter } from "../utils/intl.js";
const EMOJI_REGEX = emojiRegex();
function stringWidthJavaScript(str) {
  if (typeof str !== "string" || str.length === 0) {
    return 0;
  }
  let isPureAscii = true;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 127 || code === 27) {
      isPureAscii = false;
      break;
    }
  }
  if (isPureAscii) {
    let width2 = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code > 31) {
        width2++;
      }
    }
    return width2;
  }
  if (str.includes("\x1B")) {
    str = stripAnsi(str);
    if (str.length === 0) {
      return 0;
    }
  }
  if (!needsSegmentation(str)) {
    let width2 = 0;
    for (const char of str) {
      const codePoint = char.codePointAt(0);
      if (!isZeroWidth(codePoint)) {
        width2 += eastAsianWidth(codePoint, { ambiguousAsWide: false });
      }
    }
    return width2;
  }
  let width = 0;
  for (const { segment: grapheme } of getGraphemeSegmenter().segment(str)) {
    EMOJI_REGEX.lastIndex = 0;
    if (EMOJI_REGEX.test(grapheme)) {
      width += getEmojiWidth(grapheme);
      continue;
    }
    for (const char of grapheme) {
      const codePoint = char.codePointAt(0);
      if (!isZeroWidth(codePoint)) {
        width += eastAsianWidth(codePoint, { ambiguousAsWide: false });
        break;
      }
    }
  }
  return width;
}
function needsSegmentation(str) {
  for (const char of str) {
    const cp = char.codePointAt(0);
    if (cp >= 127744 && cp <= 129791) return true;
    if (cp >= 9728 && cp <= 10175) return true;
    if (cp >= 127462 && cp <= 127487) return true;
    if (cp >= 65024 && cp <= 65039) return true;
    if (cp === 8205) return true;
  }
  return false;
}
function getEmojiWidth(grapheme) {
  const first = grapheme.codePointAt(0);
  if (first >= 127462 && first <= 127487) {
    let count = 0;
    for (const _ of grapheme) count++;
    return count === 1 ? 1 : 2;
  }
  if (grapheme.length === 2) {
    const second = grapheme.codePointAt(1);
    if (second === 65039 && (first >= 48 && first <= 57 || first === 35 || first === 42)) {
      return 1;
    }
  }
  return 2;
}
function isZeroWidth(codePoint) {
  if (codePoint >= 32 && codePoint < 127) return false;
  if (codePoint >= 160 && codePoint < 768) return codePoint === 173;
  if (codePoint <= 31 || codePoint >= 127 && codePoint <= 159) return true;
  if (codePoint >= 8203 && codePoint <= 8205 || // ZW space/joiner
  codePoint === 65279 || // BOM
  codePoint >= 8288 && codePoint <= 8292) {
    return true;
  }
  if (codePoint >= 65024 && codePoint <= 65039 || codePoint >= 917760 && codePoint <= 917999) {
    return true;
  }
  if (codePoint >= 768 && codePoint <= 879 || codePoint >= 6832 && codePoint <= 6911 || codePoint >= 7616 && codePoint <= 7679 || codePoint >= 8400 && codePoint <= 8447 || codePoint >= 65056 && codePoint <= 65071) {
    return true;
  }
  if (codePoint >= 2304 && codePoint <= 3407) {
    const offset = codePoint & 127;
    if (offset <= 3) return true;
    if (offset >= 58 && offset <= 79) return true;
    if (offset >= 81 && offset <= 87) return true;
    if (offset >= 98 && offset <= 99) return true;
  }
  if (codePoint === 3633 || // Thai MAI HAN-AKAT
  codePoint >= 3636 && codePoint <= 3642 || // Thai vowel signs (skip U+0E32, U+0E33)
  codePoint >= 3655 && codePoint <= 3662 || // Thai vowel signs and marks
  codePoint === 3761 || // Lao MAI KAN
  codePoint >= 3764 && codePoint <= 3772 || // Lao vowel signs (skip U+0EB2, U+0EB3)
  codePoint >= 3784 && codePoint <= 3789) {
    return true;
  }
  if (codePoint >= 1536 && codePoint <= 1541 || codePoint === 1757 || codePoint === 1807 || codePoint === 2274) {
    return true;
  }
  if (codePoint >= 55296 && codePoint <= 57343) return true;
  if (codePoint >= 917504 && codePoint <= 917631) return true;
  return false;
}
const bunStringWidth = typeof Bun !== "undefined" && typeof Bun.stringWidth === "function" ? Bun.stringWidth : null;
const BUN_STRING_WIDTH_OPTS = { ambiguousIsNarrow: true };
const stringWidth = bunStringWidth ? (str) => bunStringWidth(str, BUN_STRING_WIDTH_OPTS) : stringWidthJavaScript;
export {
  stringWidth
};
