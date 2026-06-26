import { stringWidth } from "../ink/stringWidth.js";
import { getGraphemeSegmenter } from "./intl.js";
function truncatePathMiddle(path, maxLength) {
  if (stringWidth(path) <= maxLength) {
    return path;
  }
  if (maxLength <= 0) {
    return "\u2026";
  }
  if (maxLength < 5) {
    return truncateToWidth(path, maxLength);
  }
  const lastSlash = path.lastIndexOf("/");
  const filename = lastSlash >= 0 ? path.slice(lastSlash) : path;
  const directory = lastSlash >= 0 ? path.slice(0, lastSlash) : "";
  const filenameWidth = stringWidth(filename);
  if (filenameWidth >= maxLength - 1) {
    return truncateStartToWidth(path, maxLength);
  }
  const availableForDir = maxLength - 1 - filenameWidth;
  if (availableForDir <= 0) {
    return truncateStartToWidth(filename, maxLength);
  }
  const truncatedDir = truncateToWidthNoEllipsis(directory, availableForDir);
  return truncatedDir + "\u2026" + filename;
}
function truncateToWidth(text, maxWidth) {
  if (stringWidth(text) <= maxWidth) return text;
  if (maxWidth <= 1) return "\u2026";
  let width = 0;
  let result = "";
  for (const { segment } of getGraphemeSegmenter().segment(text)) {
    const segWidth = stringWidth(segment);
    if (width + segWidth > maxWidth - 1) break;
    result += segment;
    width += segWidth;
  }
  return result + "\u2026";
}
function truncateStartToWidth(text, maxWidth) {
  if (stringWidth(text) <= maxWidth) return text;
  if (maxWidth <= 1) return "\u2026";
  const segments = [...getGraphemeSegmenter().segment(text)];
  let width = 0;
  let startIdx = segments.length;
  for (let i = segments.length - 1; i >= 0; i--) {
    const segWidth = stringWidth(segments[i].segment);
    if (width + segWidth > maxWidth - 1) break;
    width += segWidth;
    startIdx = i;
  }
  return "\u2026" + segments.slice(startIdx).map((s) => s.segment).join("");
}
function truncateToWidthNoEllipsis(text, maxWidth) {
  if (stringWidth(text) <= maxWidth) return text;
  if (maxWidth <= 0) return "";
  let width = 0;
  let result = "";
  for (const { segment } of getGraphemeSegmenter().segment(text)) {
    const segWidth = stringWidth(segment);
    if (width + segWidth > maxWidth) break;
    result += segment;
    width += segWidth;
  }
  return result;
}
function truncate(str, maxWidth, singleLine = false) {
  let result = str;
  if (singleLine) {
    const firstNewline = str.indexOf("\n");
    if (firstNewline !== -1) {
      result = str.substring(0, firstNewline);
      if (stringWidth(result) + 1 > maxWidth) {
        return truncateToWidth(result, maxWidth);
      }
      return `${result}\u2026`;
    }
  }
  if (stringWidth(result) <= maxWidth) {
    return result;
  }
  return truncateToWidth(result, maxWidth);
}
function wrapText(text, width) {
  const lines = [];
  let currentLine = "";
  let currentWidth = 0;
  for (const { segment } of getGraphemeSegmenter().segment(text)) {
    const segWidth = stringWidth(segment);
    if (currentWidth + segWidth <= width) {
      currentLine += segment;
      currentWidth += segWidth;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = segment;
      currentWidth = segWidth;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}
export {
  truncate,
  truncatePathMiddle,
  truncateStartToWidth,
  truncateToWidth,
  truncateToWidthNoEllipsis,
  wrapText
};
