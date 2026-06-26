function prependModeCharacterToInput(input, mode) {
  switch (mode) {
    case "bash":
      return `!${input}`;
    default:
      return input;
  }
}
function getModeFromInput(input) {
  if (input.startsWith("!")) {
    return "bash";
  }
  return "prompt";
}
function getValueFromInput(input) {
  const mode = getModeFromInput(input);
  if (mode === "prompt") {
    return input;
  }
  return input.slice(1);
}
function isInputModeCharacter(input) {
  return input === "!";
}
export {
  getModeFromInput,
  getValueFromInput,
  isInputModeCharacter,
  prependModeCharacterToInput
};
