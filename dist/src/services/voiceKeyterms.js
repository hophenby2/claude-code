import { basename } from "path";
import { getProjectRoot } from "../bootstrap/state.js";
import { getBranch } from "../utils/git.js";
const GLOBAL_KEYTERMS = [
  // Terms Deepgram consistently mangles without keyword hints.
  // Note: "Claude" and "Anthropic" are already server-side base keyterms.
  // Avoid terms nobody speaks aloud as-spelled (stdout → "standard out").
  "MCP",
  "symlink",
  "grep",
  "regex",
  "localhost",
  "codebase",
  "TypeScript",
  "JSON",
  "OAuth",
  "webhook",
  "gRPC",
  "dotfiles",
  "subagent",
  "worktree"
];
function splitIdentifier(name) {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[-_./\s]+/).map((w) => w.trim()).filter((w) => w.length > 2 && w.length <= 20);
}
function fileNameWords(filePath) {
  const stem = basename(filePath).replace(/\.[^.]+$/, "");
  return splitIdentifier(stem);
}
const MAX_KEYTERMS = 50;
async function getVoiceKeyterms(recentFiles) {
  const terms = new Set(GLOBAL_KEYTERMS);
  try {
    const projectRoot = getProjectRoot();
    if (projectRoot) {
      const name = basename(projectRoot);
      if (name.length > 2 && name.length <= 50) {
        terms.add(name);
      }
    }
  } catch {
  }
  try {
    const branch = await getBranch();
    if (branch) {
      for (const word of splitIdentifier(branch)) {
        terms.add(word);
      }
    }
  } catch {
  }
  if (recentFiles) {
    for (const filePath of recentFiles) {
      if (terms.size >= MAX_KEYTERMS) break;
      for (const word of fileNameWords(filePath)) {
        terms.add(word);
      }
    }
  }
  return [...terms].slice(0, MAX_KEYTERMS);
}
export {
  getVoiceKeyterms,
  splitIdentifier
};
