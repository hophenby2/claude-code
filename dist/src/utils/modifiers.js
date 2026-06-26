let prewarmed = false;
function prewarmModifiers() {
  if (prewarmed || process.platform !== "darwin") {
    return;
  }
  prewarmed = true;
  try {
    const { prewarm } = require("modifiers-napi");
    prewarm();
  } catch {
  }
}
function isModifierPressed(modifier) {
  if (process.platform !== "darwin") {
    return false;
  }
  const { isModifierPressed: nativeIsModifierPressed } = (
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("modifiers-napi")
  );
  return nativeIsModifierPressed(modifier);
}
export {
  isModifierPressed,
  prewarmModifiers
};
