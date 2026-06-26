const MODEL_ALIASES = [
  "sonnet",
  "opus",
  "haiku",
  "best",
  "sonnet[1m]",
  "opus[1m]",
  "opusplan"
];
function isModelAlias(modelInput) {
  return MODEL_ALIASES.includes(modelInput);
}
const MODEL_FAMILY_ALIASES = ["sonnet", "opus", "haiku"];
function isModelFamilyAlias(model) {
  return MODEL_FAMILY_ALIASES.includes(model);
}
export {
  MODEL_ALIASES,
  MODEL_FAMILY_ALIASES,
  isModelAlias,
  isModelFamilyAlias
};
