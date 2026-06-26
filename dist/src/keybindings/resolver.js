import { getKeyName, matchesBinding } from "./match.js";
import { chordToString } from "./parser.js";
function resolveKey(input, key, activeContexts, bindings) {
  let match;
  const ctxSet = new Set(activeContexts);
  for (const binding of bindings) {
    if (binding.chord.length !== 1) continue;
    if (!ctxSet.has(binding.context)) continue;
    if (matchesBinding(input, key, binding)) {
      match = binding;
    }
  }
  if (!match) {
    return { type: "none" };
  }
  if (match.action === null) {
    return { type: "unbound" };
  }
  return { type: "match", action: match.action };
}
function getBindingDisplayText(action, context, bindings) {
  const binding = bindings.findLast(
    (b) => b.action === action && b.context === context
  );
  return binding ? chordToString(binding.chord) : void 0;
}
function buildKeystroke(input, key) {
  const keyName = getKeyName(input, key);
  if (!keyName) return null;
  const effectiveMeta = key.escape ? false : key.meta;
  return {
    key: keyName,
    ctrl: key.ctrl,
    alt: effectiveMeta,
    shift: key.shift,
    meta: effectiveMeta,
    super: key.super
  };
}
function keystrokesEqual(a, b) {
  return a.key === b.key && a.ctrl === b.ctrl && a.shift === b.shift && (a.alt || a.meta) === (b.alt || b.meta) && a.super === b.super;
}
function chordPrefixMatches(prefix, binding) {
  if (prefix.length >= binding.chord.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    const prefixKey = prefix[i];
    const bindingKey = binding.chord[i];
    if (!prefixKey || !bindingKey) return false;
    if (!keystrokesEqual(prefixKey, bindingKey)) return false;
  }
  return true;
}
function chordExactlyMatches(chord, binding) {
  if (chord.length !== binding.chord.length) return false;
  for (let i = 0; i < chord.length; i++) {
    const chordKey = chord[i];
    const bindingKey = binding.chord[i];
    if (!chordKey || !bindingKey) return false;
    if (!keystrokesEqual(chordKey, bindingKey)) return false;
  }
  return true;
}
function resolveKeyWithChordState(input, key, activeContexts, bindings, pending) {
  if (key.escape && pending !== null) {
    return { type: "chord_cancelled" };
  }
  const currentKeystroke = buildKeystroke(input, key);
  if (!currentKeystroke) {
    if (pending !== null) {
      return { type: "chord_cancelled" };
    }
    return { type: "none" };
  }
  const testChord = pending ? [...pending, currentKeystroke] : [currentKeystroke];
  const ctxSet = new Set(activeContexts);
  const contextBindings = bindings.filter((b) => ctxSet.has(b.context));
  const chordWinners = /* @__PURE__ */ new Map();
  for (const binding of contextBindings) {
    if (binding.chord.length > testChord.length && chordPrefixMatches(testChord, binding)) {
      chordWinners.set(chordToString(binding.chord), binding.action);
    }
  }
  let hasLongerChords = false;
  for (const action of chordWinners.values()) {
    if (action !== null) {
      hasLongerChords = true;
      break;
    }
  }
  if (hasLongerChords) {
    return { type: "chord_started", pending: testChord };
  }
  let exactMatch;
  for (const binding of contextBindings) {
    if (chordExactlyMatches(testChord, binding)) {
      exactMatch = binding;
    }
  }
  if (exactMatch) {
    if (exactMatch.action === null) {
      return { type: "unbound" };
    }
    return { type: "match", action: exactMatch.action };
  }
  if (pending !== null) {
    return { type: "chord_cancelled" };
  }
  return { type: "none" };
}
export {
  getBindingDisplayText,
  keystrokesEqual,
  resolveKey,
  resolveKeyWithChordState
};
