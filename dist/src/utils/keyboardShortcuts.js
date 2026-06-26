const MACOS_OPTION_SPECIAL_CHARS = {
  "\u2020": "alt+t",
  // Option+T -> thinking toggle
  \u03C0: "alt+p",
  // Option+P -> model picker
  \u00F8: "alt+o"
  // Option+O -> fast mode
};
function isMacosOptionChar(char) {
  return char in MACOS_OPTION_SPECIAL_CHARS;
}
export {
  MACOS_OPTION_SPECIAL_CHARS,
  isMacosOptionChar
};
