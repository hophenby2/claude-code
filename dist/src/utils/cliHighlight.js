import { extname } from "path";
let cliHighlightPromise;
let loadedGetLanguage;
async function loadCliHighlight() {
  try {
    const cliHighlight = await import("cli-highlight");
    const highlightJs = await import("highlight.js");
    loadedGetLanguage = highlightJs.getLanguage;
    return {
      highlight: cliHighlight.highlight,
      supportsLanguage: cliHighlight.supportsLanguage
    };
  } catch {
    return null;
  }
}
function getCliHighlightPromise() {
  cliHighlightPromise ??= loadCliHighlight();
  return cliHighlightPromise;
}
async function getLanguageName(file_path) {
  await getCliHighlightPromise();
  const ext = extname(file_path).slice(1);
  if (!ext) return "unknown";
  return loadedGetLanguage?.(ext)?.name ?? "unknown";
}
export {
  getCliHighlightPromise,
  getLanguageName
};
