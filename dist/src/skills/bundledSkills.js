import { constants as fsConstants } from "fs";
import { mkdir, open } from "fs/promises";
import { dirname, isAbsolute, join, normalize, sep as pathSep } from "path";
import { logForDebugging } from "../utils/debug.js";
import { getBundledSkillsRoot } from "../utils/permissions/filesystem.js";
const bundledSkills = [];
function registerBundledSkill(definition) {
  const { files } = definition;
  let skillRoot;
  let getPromptForCommand = definition.getPromptForCommand;
  if (files && Object.keys(files).length > 0) {
    skillRoot = getBundledSkillExtractDir(definition.name);
    let extractionPromise;
    const inner = definition.getPromptForCommand;
    getPromptForCommand = async (args, ctx) => {
      extractionPromise ??= extractBundledSkillFiles(definition.name, files);
      const extractedDir = await extractionPromise;
      const blocks = await inner(args, ctx);
      if (extractedDir === null) return blocks;
      return prependBaseDir(blocks, extractedDir);
    };
  }
  const command = {
    type: "prompt",
    name: definition.name,
    description: definition.description,
    aliases: definition.aliases,
    hasUserSpecifiedDescription: true,
    allowedTools: definition.allowedTools ?? [],
    argumentHint: definition.argumentHint,
    whenToUse: definition.whenToUse,
    model: definition.model,
    disableModelInvocation: definition.disableModelInvocation ?? false,
    userInvocable: definition.userInvocable ?? true,
    contentLength: 0,
    // Not applicable for bundled skills
    source: "bundled",
    loadedFrom: "bundled",
    hooks: definition.hooks,
    skillRoot,
    context: definition.context,
    agent: definition.agent,
    isEnabled: definition.isEnabled,
    isHidden: !(definition.userInvocable ?? true),
    progressMessage: "running",
    getPromptForCommand
  };
  bundledSkills.push(command);
}
function getBundledSkills() {
  return [...bundledSkills];
}
function clearBundledSkills() {
  bundledSkills.length = 0;
}
function getBundledSkillExtractDir(skillName) {
  return join(getBundledSkillsRoot(), skillName);
}
async function extractBundledSkillFiles(skillName, files) {
  const dir = getBundledSkillExtractDir(skillName);
  try {
    await writeSkillFiles(dir, files);
    return dir;
  } catch (e) {
    logForDebugging(
      `Failed to extract bundled skill '${skillName}' to ${dir}: ${e instanceof Error ? e.message : String(e)}`
    );
    return null;
  }
}
async function writeSkillFiles(dir, files) {
  const byParent = /* @__PURE__ */ new Map();
  for (const [relPath, content] of Object.entries(files)) {
    const target = resolveSkillFilePath(dir, relPath);
    const parent = dirname(target);
    const entry = [target, content];
    const group = byParent.get(parent);
    if (group) group.push(entry);
    else byParent.set(parent, [entry]);
  }
  await Promise.all(
    [...byParent].map(async ([parent, entries]) => {
      await mkdir(parent, { recursive: true, mode: 448 });
      await Promise.all(entries.map(([p, c]) => safeWriteFile(p, c)));
    })
  );
}
const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const SAFE_WRITE_FLAGS = process.platform === "win32" ? "wx" : fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | O_NOFOLLOW;
async function safeWriteFile(p, content) {
  const fh = await open(p, SAFE_WRITE_FLAGS, 384);
  try {
    await fh.writeFile(content, "utf8");
  } finally {
    await fh.close();
  }
}
function resolveSkillFilePath(baseDir, relPath) {
  const normalized = normalize(relPath);
  if (isAbsolute(normalized) || normalized.split(pathSep).includes("..") || normalized.split("/").includes("..")) {
    throw new Error(`bundled skill file path escapes skill dir: ${relPath}`);
  }
  return join(baseDir, normalized);
}
function prependBaseDir(blocks, baseDir) {
  const prefix = `Base directory for this skill: ${baseDir}

`;
  if (blocks.length > 0 && blocks[0].type === "text") {
    return [
      { type: "text", text: prefix + blocks[0].text },
      ...blocks.slice(1)
    ];
  }
  return [{ type: "text", text: prefix }, ...blocks];
}
export {
  clearBundledSkills,
  getBundledSkillExtractDir,
  getBundledSkills,
  registerBundledSkill
};
