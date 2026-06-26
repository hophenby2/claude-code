function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
function plural(n, word, pluralWord = word + "s") {
  return n === 1 ? word : pluralWord;
}
function firstLineOf(s) {
  const nl = s.indexOf("\n");
  return nl === -1 ? s : s.slice(0, nl);
}
function countCharInString(str, char, start = 0) {
  let count = 0;
  let i = str.indexOf(char, start);
  while (i !== -1) {
    count++;
    i = str.indexOf(char, i + 1);
  }
  return count;
}
function normalizeFullWidthDigits(input) {
  return input.replace(
    /[０-９]/g,
    (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248)
  );
}
function normalizeFullWidthSpace(input) {
  return input.replace(/\u3000/g, " ");
}
const MAX_STRING_LENGTH = 2 ** 25;
function safeJoinLines(lines, delimiter = ",", maxSize = MAX_STRING_LENGTH) {
  const truncationMarker = "...[truncated]";
  let result = "";
  for (const line of lines) {
    const delimiterToAdd = result ? delimiter : "";
    const fullAddition = delimiterToAdd + line;
    if (result.length + fullAddition.length <= maxSize) {
      result += fullAddition;
    } else {
      const remainingSpace = maxSize - result.length - delimiterToAdd.length - truncationMarker.length;
      if (remainingSpace > 0) {
        result += delimiterToAdd + line.slice(0, remainingSpace) + truncationMarker;
      } else {
        result += truncationMarker;
      }
      return result;
    }
  }
  return result;
}
class EndTruncatingAccumulator {
  /**
   * Creates a new EndTruncatingAccumulator
   * @param maxSize Maximum size in characters before truncation occurs
   */
  constructor(maxSize = MAX_STRING_LENGTH) {
    this.maxSize = maxSize;
  }
  maxSize;
  content = "";
  isTruncated = false;
  totalBytesReceived = 0;
  /**
   * Appends data to the accumulator. If the total size exceeds maxSize,
   * the end is truncated to maintain the size limit.
   * @param data The string data to append
   */
  append(data) {
    const str = typeof data === "string" ? data : data.toString();
    this.totalBytesReceived += str.length;
    if (this.isTruncated && this.content.length >= this.maxSize) {
      return;
    }
    if (this.content.length + str.length > this.maxSize) {
      const remainingSpace = this.maxSize - this.content.length;
      if (remainingSpace > 0) {
        this.content += str.slice(0, remainingSpace);
      }
      this.isTruncated = true;
    } else {
      this.content += str;
    }
  }
  /**
   * Returns the accumulated string, with truncation marker if truncated
   */
  toString() {
    if (!this.isTruncated) {
      return this.content;
    }
    const truncatedBytes = this.totalBytesReceived - this.maxSize;
    const truncatedKB = Math.round(truncatedBytes / 1024);
    return this.content + `
... [output truncated - ${truncatedKB}KB removed]`;
  }
  /**
   * Clears all accumulated data
   */
  clear() {
    this.content = "";
    this.isTruncated = false;
    this.totalBytesReceived = 0;
  }
  /**
   * Returns the current size of accumulated data
   */
  get length() {
    return this.content.length;
  }
  /**
   * Returns whether truncation has occurred
   */
  get truncated() {
    return this.isTruncated;
  }
  /**
   * Returns total bytes received (before truncation)
   */
  get totalBytes() {
    return this.totalBytesReceived;
  }
}
function truncateToLines(text, maxLines) {
  const lines = text.split("\n");
  if (lines.length <= maxLines) {
    return text;
  }
  return lines.slice(0, maxLines).join("\n") + "\u2026";
}
export {
  EndTruncatingAccumulator,
  capitalize,
  countCharInString,
  escapeRegExp,
  firstLineOf,
  normalizeFullWidthDigits,
  normalizeFullWidthSpace,
  plural,
  safeJoinLines,
  truncateToLines
};
