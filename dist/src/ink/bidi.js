import bidiFactory from "bidi-js";
let bidiInstance;
let needsSoftwareBidi;
function needsBidi() {
  if (needsSoftwareBidi === void 0) {
    needsSoftwareBidi = process.platform === "win32" || typeof process.env["WT_SESSION"] === "string" || // WSL in Windows Terminal
    process.env["TERM_PROGRAM"] === "vscode";
  }
  return needsSoftwareBidi;
}
function getBidi() {
  if (!bidiInstance) {
    bidiInstance = bidiFactory();
  }
  return bidiInstance;
}
function reorderBidi(characters) {
  if (!needsBidi() || characters.length === 0) {
    return characters;
  }
  const plainText = characters.map((c) => c.value).join("");
  if (!hasRTLCharacters(plainText)) {
    return characters;
  }
  const bidi = getBidi();
  const { levels } = bidi.getEmbeddingLevels(plainText, "auto");
  const charLevels = [];
  let offset = 0;
  for (let i = 0; i < characters.length; i++) {
    charLevels.push(levels[offset]);
    offset += characters[i].value.length;
  }
  const reordered = [...characters];
  const maxLevel = Math.max(...charLevels);
  for (let level = maxLevel; level >= 1; level--) {
    let i = 0;
    while (i < reordered.length) {
      if (charLevels[i] >= level) {
        let j = i + 1;
        while (j < reordered.length && charLevels[j] >= level) {
          j++;
        }
        reverseRange(reordered, i, j - 1);
        reverseRangeNumbers(charLevels, i, j - 1);
        i = j;
      } else {
        i++;
      }
    }
  }
  return reordered;
}
function reverseRange(arr, start, end) {
  while (start < end) {
    const temp = arr[start];
    arr[start] = arr[end];
    arr[end] = temp;
    start++;
    end--;
  }
}
function reverseRangeNumbers(arr, start, end) {
  while (start < end) {
    const temp = arr[start];
    arr[start] = arr[end];
    arr[end] = temp;
    start++;
    end--;
  }
}
function hasRTLCharacters(text) {
  return /[\u0590-\u05FF\uFB1D-\uFB4F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0780-\u07BF\u0700-\u074F]/u.test(
    text
  );
}
export {
  reorderBidi
};
