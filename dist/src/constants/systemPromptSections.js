import {
  clearBetaHeaderLatches,
  clearSystemPromptSectionState,
  getSystemPromptSectionCache,
  setSystemPromptSectionCacheEntry
} from "../bootstrap/state.js";
function systemPromptSection(name, compute) {
  return { name, compute, cacheBreak: false };
}
function DANGEROUS_uncachedSystemPromptSection(name, compute, _reason) {
  return { name, compute, cacheBreak: true };
}
async function resolveSystemPromptSections(sections) {
  const cache = getSystemPromptSectionCache();
  return Promise.all(
    sections.map(async (s) => {
      if (!s.cacheBreak && cache.has(s.name)) {
        return cache.get(s.name) ?? null;
      }
      const value = await s.compute();
      setSystemPromptSectionCacheEntry(s.name, value);
      return value;
    })
  );
}
function clearSystemPromptSections() {
  clearSystemPromptSectionState();
  clearBetaHeaderLatches();
}
export {
  DANGEROUS_uncachedSystemPromptSection,
  clearSystemPromptSections,
  resolveSystemPromptSections,
  systemPromptSection
};
