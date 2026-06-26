import { getGlobalConfig, saveGlobalConfig } from "../config.js";
const SKILL_USAGE_DEBOUNCE_MS = 6e4;
const lastWriteBySkill = /* @__PURE__ */ new Map();
function recordSkillUsage(skillName) {
  const now = Date.now();
  const lastWrite = lastWriteBySkill.get(skillName);
  if (lastWrite !== void 0 && now - lastWrite < SKILL_USAGE_DEBOUNCE_MS) {
    return;
  }
  lastWriteBySkill.set(skillName, now);
  saveGlobalConfig((current) => {
    const existing = current.skillUsage?.[skillName];
    return {
      ...current,
      skillUsage: {
        ...current.skillUsage,
        [skillName]: {
          usageCount: (existing?.usageCount ?? 0) + 1,
          lastUsedAt: now
        }
      }
    };
  });
}
function getSkillUsageScore(skillName) {
  const config = getGlobalConfig();
  const usage = config.skillUsage?.[skillName];
  if (!usage) return 0;
  const daysSinceUse = (Date.now() - usage.lastUsedAt) / (1e3 * 60 * 60 * 24);
  const recencyFactor = Math.pow(0.5, daysSinceUse / 7);
  return usage.usageCount * Math.max(recencyFactor, 0.1);
}
export {
  getSkillUsageScore,
  recordSkillUsage
};
