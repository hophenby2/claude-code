function getInkModifiers(key) {
  return {
    ctrl: key.ctrl,
    shift: key.shift,
    meta: key.meta,
    super: key.super
  };
}
function getKeyName(input, key) {
  if (key.escape) return "escape";
  if (key.return) return "enter";
  if (key.tab) return "tab";
  if (key.backspace) return "backspace";
  if (key.delete) return "delete";
  if (key.upArrow) return "up";
  if (key.downArrow) return "down";
  if (key.leftArrow) return "left";
  if (key.rightArrow) return "right";
  if (key.pageUp) return "pageup";
  if (key.pageDown) return "pagedown";
  if (key.wheelUp) return "wheelup";
  if (key.wheelDown) return "wheeldown";
  if (key.home) return "home";
  if (key.end) return "end";
  if (input.length === 1) return input.toLowerCase();
  return null;
}
function modifiersMatch(inkMods, target) {
  if (inkMods.ctrl !== target.ctrl) return false;
  if (inkMods.shift !== target.shift) return false;
  const targetNeedsMeta = target.alt || target.meta;
  if (inkMods.meta !== targetNeedsMeta) return false;
  if (inkMods.super !== target.super) return false;
  return true;
}
function matchesKeystroke(input, key, target) {
  const keyName = getKeyName(input, key);
  if (keyName !== target.key) return false;
  const inkMods = getInkModifiers(key);
  if (key.escape) {
    return modifiersMatch({ ...inkMods, meta: false }, target);
  }
  return modifiersMatch(inkMods, target);
}
function matchesBinding(input, key, binding) {
  if (binding.chord.length !== 1) return false;
  const keystroke = binding.chord[0];
  if (!keystroke) return false;
  return matchesKeystroke(input, key, keystroke);
}
export {
  getKeyName,
  matchesBinding,
  matchesKeystroke
};
