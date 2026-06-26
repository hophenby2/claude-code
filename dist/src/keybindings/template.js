import { jsonStringify } from "../utils/slowOperations.js";
import { DEFAULT_BINDINGS } from "./defaultBindings.js";
import {
  NON_REBINDABLE,
  normalizeKeyForComparison
} from "./reservedShortcuts.js";
function filterReservedShortcuts(blocks) {
  const reservedKeys = new Set(
    NON_REBINDABLE.map((r) => normalizeKeyForComparison(r.key))
  );
  return blocks.map((block) => {
    const filteredBindings = {};
    for (const [key, action] of Object.entries(block.bindings)) {
      if (!reservedKeys.has(normalizeKeyForComparison(key))) {
        filteredBindings[key] = action;
      }
    }
    return { context: block.context, bindings: filteredBindings };
  }).filter((block) => Object.keys(block.bindings).length > 0);
}
function generateKeybindingsTemplate() {
  const bindings = filterReservedShortcuts(DEFAULT_BINDINGS);
  const config = {
    $schema: "https://www.schemastore.org/claude-code-keybindings.json",
    $docs: "https://code.claude.com/docs/en/keybindings",
    bindings
  };
  return jsonStringify(config, null, 2) + "\n";
}
export {
  generateKeybindingsTemplate
};
