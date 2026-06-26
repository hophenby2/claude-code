import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
const feature = (_name) => false;
import { join } from "path";
import { getFsImplementation } from "../utils/fsOperations.js";
import { getAutoMemPath, isAutoMemoryEnabled } from "./paths.js";
const teamMemPaths = false ? require2("./teamMemPaths.js") : null;
import { getOriginalCwd } from "../bootstrap/state.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import {
  logEvent
} from "../services/analytics/index.js";
import { GREP_TOOL_NAME } from "../tools/GrepTool/prompt.js";
import { isReplModeEnabled } from "../tools/REPLTool/constants.js";
import { logForDebugging } from "../utils/debug.js";
import { hasEmbeddedSearchTools } from "../utils/embeddedTools.js";
import { isEnvTruthy } from "../utils/envUtils.js";
import { formatFileSize } from "../utils/format.js";
import { getProjectDir } from "../utils/sessionStorage.js";
import { getInitialSettings } from "../utils/settings/settings.js";
import {
  MEMORY_FRONTMATTER_EXAMPLE,
  TRUSTING_RECALL_SECTION,
  TYPES_SECTION_INDIVIDUAL,
  WHAT_NOT_TO_SAVE_SECTION,
  WHEN_TO_ACCESS_SECTION
} from "./memoryTypes.js";
const ENTRYPOINT_NAME = "MEMORY.md";
const MAX_ENTRYPOINT_LINES = 200;
const MAX_ENTRYPOINT_BYTES = 25e3;
const AUTO_MEM_DISPLAY_NAME = "auto memory";
function truncateEntrypointContent(raw) {
  const trimmed = raw.trim();
  const contentLines = trimmed.split("\n");
  const lineCount = contentLines.length;
  const byteCount = trimmed.length;
  const wasLineTruncated = lineCount > MAX_ENTRYPOINT_LINES;
  const wasByteTruncated = byteCount > MAX_ENTRYPOINT_BYTES;
  if (!wasLineTruncated && !wasByteTruncated) {
    return {
      content: trimmed,
      lineCount,
      byteCount,
      wasLineTruncated,
      wasByteTruncated
    };
  }
  let truncated = wasLineTruncated ? contentLines.slice(0, MAX_ENTRYPOINT_LINES).join("\n") : trimmed;
  if (truncated.length > MAX_ENTRYPOINT_BYTES) {
    const cutAt = truncated.lastIndexOf("\n", MAX_ENTRYPOINT_BYTES);
    truncated = truncated.slice(0, cutAt > 0 ? cutAt : MAX_ENTRYPOINT_BYTES);
  }
  const reason = wasByteTruncated && !wasLineTruncated ? `${formatFileSize(byteCount)} (limit: ${formatFileSize(MAX_ENTRYPOINT_BYTES)}) \u2014 index entries are too long` : wasLineTruncated && !wasByteTruncated ? `${lineCount} lines (limit: ${MAX_ENTRYPOINT_LINES})` : `${lineCount} lines and ${formatFileSize(byteCount)}`;
  return {
    content: truncated + `

> WARNING: ${ENTRYPOINT_NAME} is ${reason}. Only part of it was loaded. Keep index entries to one line under ~200 chars; move detail into topic files.`,
    lineCount,
    byteCount,
    wasLineTruncated,
    wasByteTruncated
  };
}
const teamMemPrompts = false ? require2("./teamMemPrompts.js") : null;
const DIR_EXISTS_GUIDANCE = "This directory already exists \u2014 write to it directly with the Write tool (do not run mkdir or check for its existence).";
const DIRS_EXIST_GUIDANCE = "Both directories already exist \u2014 write to them directly with the Write tool (do not run mkdir or check for their existence).";
async function ensureMemoryDirExists(memoryDir) {
  const fs = getFsImplementation();
  try {
    await fs.mkdir(memoryDir);
  } catch (e) {
    const code = e instanceof Error && "code" in e && typeof e.code === "string" ? e.code : void 0;
    logForDebugging(
      `ensureMemoryDirExists failed for ${memoryDir}: ${code ?? String(e)}`,
      { level: "debug" }
    );
  }
}
function logMemoryDirCounts(memoryDir, baseMetadata) {
  const fs = getFsImplementation();
  void fs.readdir(memoryDir).then(
    (dirents) => {
      let fileCount = 0;
      let subdirCount = 0;
      for (const d of dirents) {
        if (d.isFile()) {
          fileCount++;
        } else if (d.isDirectory()) {
          subdirCount++;
        }
      }
      logEvent("tengu_memdir_loaded", {
        ...baseMetadata,
        total_file_count: fileCount,
        total_subdir_count: subdirCount
      });
    },
    () => {
      logEvent("tengu_memdir_loaded", baseMetadata);
    }
  );
}
function buildMemoryLines(displayName, memoryDir, extraGuidelines, skipIndex = false) {
  const howToSave = skipIndex ? [
    "## How to save memories",
    "",
    "Write each memory to its own file (e.g., `user_role.md`, `feedback_testing.md`) using this frontmatter format:",
    "",
    ...MEMORY_FRONTMATTER_EXAMPLE,
    "",
    "- Keep the name, description, and type fields in memory files up-to-date with the content",
    "- Organize memory semantically by topic, not chronologically",
    "- Update or remove memories that turn out to be wrong or outdated",
    "- Do not write duplicate memories. First check if there is an existing memory you can update before writing a new one."
  ] : [
    "## How to save memories",
    "",
    "Saving a memory is a two-step process:",
    "",
    "**Step 1** \u2014 write the memory to its own file (e.g., `user_role.md`, `feedback_testing.md`) using this frontmatter format:",
    "",
    ...MEMORY_FRONTMATTER_EXAMPLE,
    "",
    `**Step 2** \u2014 add a pointer to that file in \`${ENTRYPOINT_NAME}\`. \`${ENTRYPOINT_NAME}\` is an index, not a memory \u2014 each entry should be one line, under ~150 characters: \`- [Title](file.md) \u2014 one-line hook\`. It has no frontmatter. Never write memory content directly into \`${ENTRYPOINT_NAME}\`.`,
    "",
    `- \`${ENTRYPOINT_NAME}\` is always loaded into your conversation context \u2014 lines after ${MAX_ENTRYPOINT_LINES} will be truncated, so keep the index concise`,
    "- Keep the name, description, and type fields in memory files up-to-date with the content",
    "- Organize memory semantically by topic, not chronologically",
    "- Update or remove memories that turn out to be wrong or outdated",
    "- Do not write duplicate memories. First check if there is an existing memory you can update before writing a new one."
  ];
  const lines = [
    `# ${displayName}`,
    "",
    `You have a persistent, file-based memory system at \`${memoryDir}\`. ${DIR_EXISTS_GUIDANCE}`,
    "",
    "You should build up this memory system over time so that future conversations can have a complete picture of who the user is, how they'd like to collaborate with you, what behaviors to avoid or repeat, and the context behind the work the user gives you.",
    "",
    "If the user explicitly asks you to remember something, save it immediately as whichever type fits best. If they ask you to forget something, find and remove the relevant entry.",
    "",
    ...TYPES_SECTION_INDIVIDUAL,
    ...WHAT_NOT_TO_SAVE_SECTION,
    "",
    ...howToSave,
    "",
    ...WHEN_TO_ACCESS_SECTION,
    "",
    ...TRUSTING_RECALL_SECTION,
    "",
    "## Memory and other forms of persistence",
    "Memory is one of several persistence mechanisms available to you as you assist the user in a given conversation. The distinction is often that memory can be recalled in future conversations and should not be used for persisting information that is only useful within the scope of the current conversation.",
    "- When to use or update a plan instead of memory: If you are about to start a non-trivial implementation task and would like to reach alignment with the user on your approach you should use a Plan rather than saving this information to memory. Similarly, if you already have a plan within the conversation and you have changed your approach persist that change by updating the plan rather than saving a memory.",
    "- When to use or update tasks instead of memory: When you need to break your work in current conversation into discrete steps or keep track of your progress use tasks instead of saving to memory. Tasks are great for persisting information about the work that needs to be done in the current conversation, but memory should be reserved for information that will be useful in future conversations.",
    "",
    ...extraGuidelines ?? [],
    ""
  ];
  lines.push(...buildSearchingPastContextSection(memoryDir));
  return lines;
}
function buildMemoryPrompt(params) {
  const { displayName, memoryDir, extraGuidelines } = params;
  const fs = getFsImplementation();
  const entrypoint = memoryDir + ENTRYPOINT_NAME;
  let entrypointContent = "";
  try {
    entrypointContent = fs.readFileSync(entrypoint, { encoding: "utf-8" });
  } catch {
  }
  const lines = buildMemoryLines(displayName, memoryDir, extraGuidelines);
  if (entrypointContent.trim()) {
    const t = truncateEntrypointContent(entrypointContent);
    const memoryType = displayName === AUTO_MEM_DISPLAY_NAME ? "auto" : "agent";
    logMemoryDirCounts(memoryDir, {
      content_length: t.byteCount,
      line_count: t.lineCount,
      was_truncated: t.wasLineTruncated,
      was_byte_truncated: t.wasByteTruncated,
      memory_type: memoryType
    });
    lines.push(`## ${ENTRYPOINT_NAME}`, "", t.content);
  } else {
    lines.push(
      `## ${ENTRYPOINT_NAME}`,
      "",
      `Your ${ENTRYPOINT_NAME} is currently empty. When you save new memories, they will appear here.`
    );
  }
  return lines.join("\n");
}
function buildAssistantDailyLogPrompt(skipIndex = false) {
  const memoryDir = getAutoMemPath();
  const logPathPattern = join(memoryDir, "logs", "YYYY", "MM", "YYYY-MM-DD.md");
  const lines = [
    "# auto memory",
    "",
    `You have a persistent, file-based memory system found at: \`${memoryDir}\``,
    "",
    "This session is long-lived. As you work, record anything worth remembering by **appending** to today's daily log file:",
    "",
    `\`${logPathPattern}\``,
    "",
    "Substitute today's date (from `currentDate` in your context) for `YYYY-MM-DD`. When the date rolls over mid-session, start appending to the new day's file.",
    "",
    "Write each entry as a short timestamped bullet. Create the file (and parent directories) on first write if it does not exist. Do not rewrite or reorganize the log \u2014 it is append-only. A separate nightly process distills these logs into `MEMORY.md` and topic files.",
    "",
    "## What to log",
    '- User corrections and preferences ("use bun, not npm"; "stop summarizing diffs")',
    "- Facts about the user, their role, or their goals",
    "- Project context that is not derivable from the code (deadlines, incidents, decisions and their rationale)",
    "- Pointers to external systems (dashboards, Linear projects, Slack channels)",
    "- Anything the user explicitly asks you to remember",
    "",
    ...WHAT_NOT_TO_SAVE_SECTION,
    "",
    ...skipIndex ? [] : [
      `## ${ENTRYPOINT_NAME}`,
      `\`${ENTRYPOINT_NAME}\` is the distilled index (maintained nightly from your logs) and is loaded into your context automatically. Read it for orientation, but do not edit it directly \u2014 record new information in today's log instead.`,
      ""
    ],
    ...buildSearchingPastContextSection(memoryDir)
  ];
  return lines.join("\n");
}
function buildSearchingPastContextSection(autoMemDir) {
  if (!getFeatureValue_CACHED_MAY_BE_STALE("tengu_coral_fern", false)) {
    return [];
  }
  const projectDir = getProjectDir(getOriginalCwd());
  const embedded = hasEmbeddedSearchTools() || isReplModeEnabled();
  const memSearch = embedded ? `grep -rn "<search term>" ${autoMemDir} --include="*.md"` : `${GREP_TOOL_NAME} with pattern="<search term>" path="${autoMemDir}" glob="*.md"`;
  const transcriptSearch = embedded ? `grep -rn "<search term>" ${projectDir}/ --include="*.jsonl"` : `${GREP_TOOL_NAME} with pattern="<search term>" path="${projectDir}/" glob="*.jsonl"`;
  return [
    "## Searching past context",
    "",
    "When looking for past context:",
    "1. Search topic files in your memory directory:",
    "```",
    memSearch,
    "```",
    "2. Session transcript logs (last resort \u2014 large files, slow):",
    "```",
    transcriptSearch,
    "```",
    "Use narrow search terms (error messages, file paths, function names) rather than broad keywords.",
    ""
  ];
}
async function loadMemoryPrompt() {
  const autoEnabled = isAutoMemoryEnabled();
  const skipIndex = getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_moth_copse",
    false
  );
  if (false) {
    logMemoryDirCounts(getAutoMemPath(), {
      memory_type: "auto"
    });
    return buildAssistantDailyLogPrompt(skipIndex);
  }
  const coworkExtraGuidelines = process.env.CLAUDE_COWORK_MEMORY_EXTRA_GUIDELINES;
  const extraGuidelines = coworkExtraGuidelines && coworkExtraGuidelines.trim().length > 0 ? [coworkExtraGuidelines] : void 0;
  if (false) {
    if (teamMemPaths.isTeamMemoryEnabled()) {
      const autoDir = getAutoMemPath();
      const teamDir = teamMemPaths.getTeamMemPath();
      await ensureMemoryDirExists(teamDir);
      logMemoryDirCounts(autoDir, {
        memory_type: "auto"
      });
      logMemoryDirCounts(teamDir, {
        memory_type: "team"
      });
      return teamMemPrompts.buildCombinedMemoryPrompt(
        extraGuidelines,
        skipIndex
      );
    }
  }
  if (autoEnabled) {
    const autoDir = getAutoMemPath();
    await ensureMemoryDirExists(autoDir);
    logMemoryDirCounts(autoDir, {
      memory_type: "auto"
    });
    return buildMemoryLines(
      "auto memory",
      autoDir,
      extraGuidelines,
      skipIndex
    ).join("\n");
  }
  logEvent("tengu_memdir_disabled", {
    disabled_by_env_var: isEnvTruthy(
      process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY
    ),
    disabled_by_setting: !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY) && getInitialSettings().autoMemoryEnabled === false
  });
  if (getFeatureValue_CACHED_MAY_BE_STALE("tengu_herring_clock", false)) {
    logEvent("tengu_team_memdir_disabled", {});
  }
  return null;
}
export {
  DIRS_EXIST_GUIDANCE,
  DIR_EXISTS_GUIDANCE,
  ENTRYPOINT_NAME,
  MAX_ENTRYPOINT_BYTES,
  MAX_ENTRYPOINT_LINES,
  buildMemoryLines,
  buildMemoryPrompt,
  buildSearchingPastContextSection,
  ensureMemoryDirExists,
  loadMemoryPrompt,
  truncateEntrypointContent
};
