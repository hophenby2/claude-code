const OPERATORS = {
  d: "delete",
  c: "change",
  y: "yank"
};
function isOperatorKey(key) {
  return key in OPERATORS;
}
const SIMPLE_MOTIONS = /* @__PURE__ */ new Set([
  "h",
  "l",
  "j",
  "k",
  // Basic movement
  "w",
  "b",
  "e",
  "W",
  "B",
  "E",
  // Word motions
  "0",
  "^",
  "$"
  // Line positions
]);
const FIND_KEYS = /* @__PURE__ */ new Set(["f", "F", "t", "T"]);
const TEXT_OBJ_SCOPES = {
  i: "inner",
  a: "around"
};
function isTextObjScopeKey(key) {
  return key in TEXT_OBJ_SCOPES;
}
const TEXT_OBJ_TYPES = /* @__PURE__ */ new Set([
  "w",
  "W",
  // Word/WORD
  '"',
  "'",
  "`",
  // Quotes
  "(",
  ")",
  "b",
  // Parens
  "[",
  "]",
  // Brackets
  "{",
  "}",
  "B",
  // Braces
  "<",
  ">"
  // Angle brackets
]);
const MAX_VIM_COUNT = 1e4;
function createInitialVimState() {
  return { mode: "INSERT", insertedText: "" };
}
function createInitialPersistentState() {
  return {
    lastChange: null,
    lastFind: null,
    register: "",
    registerIsLinewise: false
  };
}
export {
  FIND_KEYS,
  MAX_VIM_COUNT,
  OPERATORS,
  SIMPLE_MOTIONS,
  TEXT_OBJ_SCOPES,
  TEXT_OBJ_TYPES,
  createInitialPersistentState,
  createInitialVimState,
  isOperatorKey,
  isTextObjScopeKey
};
