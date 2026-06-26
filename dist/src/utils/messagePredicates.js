function isHumanTurn(m) {
  return m.type === "user" && !m.isMeta && m.toolUseResult === void 0;
}
export {
  isHumanTurn
};
