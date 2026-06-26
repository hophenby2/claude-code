import { randomUUID } from "crypto";
import { copyFile, writeFile } from "fs/promises";
import memoize from "lodash-es/memoize.js";
import { join, resolve, sep } from "path";
import { getPlanSlugCache, getSessionId } from "../bootstrap/state.js";
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from "../tools/ExitPlanModeTool/constants.js";
import { getCwd } from "./cwd.js";
import { logForDebugging } from "./debug.js";
import { getClaudeConfigHomeDir } from "./envUtils.js";
import { isENOENT } from "./errors.js";
import { getEnvironmentKind } from "./filePersistence/outputsScanner.js";
import { getFsImplementation } from "./fsOperations.js";
import { logError } from "./log.js";
import { getInitialSettings } from "./settings/settings.js";
import { generateWordSlug } from "./words.js";
const MAX_SLUG_RETRIES = 10;
function getPlanSlug(sessionId) {
  const id = sessionId ?? getSessionId();
  const cache = getPlanSlugCache();
  let slug = cache.get(id);
  if (!slug) {
    const plansDir = getPlansDirectory();
    for (let i = 0; i < MAX_SLUG_RETRIES; i++) {
      slug = generateWordSlug();
      const filePath = join(plansDir, `${slug}.md`);
      if (!getFsImplementation().existsSync(filePath)) {
        break;
      }
    }
    cache.set(id, slug);
  }
  return slug;
}
function setPlanSlug(sessionId, slug) {
  getPlanSlugCache().set(sessionId, slug);
}
function clearPlanSlug(sessionId) {
  const id = sessionId ?? getSessionId();
  getPlanSlugCache().delete(id);
}
function clearAllPlanSlugs() {
  getPlanSlugCache().clear();
}
const getPlansDirectory = memoize(function getPlansDirectory2() {
  const settings = getInitialSettings();
  const settingsDir = settings.plansDirectory;
  let plansPath;
  if (settingsDir) {
    const cwd = getCwd();
    const resolved = resolve(cwd, settingsDir);
    if (!resolved.startsWith(cwd + sep) && resolved !== cwd) {
      logError(
        new Error(`plansDirectory must be within project root: ${settingsDir}`)
      );
      plansPath = join(getClaudeConfigHomeDir(), "plans");
    } else {
      plansPath = resolved;
    }
  } else {
    plansPath = join(getClaudeConfigHomeDir(), "plans");
  }
  try {
    getFsImplementation().mkdirSync(plansPath);
  } catch (error) {
    logError(error);
  }
  return plansPath;
});
function getPlanFilePath(agentId) {
  const planSlug = getPlanSlug(getSessionId());
  if (!agentId) {
    return join(getPlansDirectory(), `${planSlug}.md`);
  }
  return join(getPlansDirectory(), `${planSlug}-agent-${agentId}.md`);
}
function getPlan(agentId) {
  const filePath = getPlanFilePath(agentId);
  try {
    return getFsImplementation().readFileSync(filePath, { encoding: "utf-8" });
  } catch (error) {
    if (isENOENT(error)) return null;
    logError(error);
    return null;
  }
}
function getSlugFromLog(log) {
  return log.messages.find((m) => m.slug)?.slug;
}
async function copyPlanForResume(log, targetSessionId) {
  const slug = getSlugFromLog(log);
  if (!slug) {
    return false;
  }
  const sessionId = targetSessionId ?? getSessionId();
  setPlanSlug(sessionId, slug);
  const planPath = join(getPlansDirectory(), `${slug}.md`);
  try {
    await getFsImplementation().readFile(planPath, { encoding: "utf-8" });
    return true;
  } catch (e) {
    if (!isENOENT(e)) {
      logError(e);
      return false;
    }
    if (getEnvironmentKind() === null) {
      return false;
    }
    logForDebugging(
      `Plan file missing during resume: ${planPath}. Attempting recovery.`
    );
    const snapshotPlan = findFileSnapshotEntry(log.messages, "plan");
    let recovered = null;
    if (snapshotPlan && snapshotPlan.content.length > 0) {
      recovered = snapshotPlan.content;
      logForDebugging(
        `Plan recovered from file snapshot, ${recovered.length} chars`,
        { level: "info" }
      );
    } else {
      recovered = recoverPlanFromMessages(log);
      if (recovered) {
        logForDebugging(
          `Plan recovered from message history, ${recovered.length} chars`,
          { level: "info" }
        );
      }
    }
    if (recovered) {
      try {
        await writeFile(planPath, recovered, { encoding: "utf-8" });
        return true;
      } catch (writeError) {
        logError(writeError);
        return false;
      }
    }
    logForDebugging(
      "Plan file recovery failed: no file snapshot or plan content found in message history"
    );
    return false;
  }
}
async function copyPlanForFork(log, targetSessionId) {
  const originalSlug = getSlugFromLog(log);
  if (!originalSlug) {
    return false;
  }
  const plansDir = getPlansDirectory();
  const originalPlanPath = join(plansDir, `${originalSlug}.md`);
  const newSlug = getPlanSlug(targetSessionId);
  const newPlanPath = join(plansDir, `${newSlug}.md`);
  try {
    await copyFile(originalPlanPath, newPlanPath);
    return true;
  } catch (error) {
    if (isENOENT(error)) {
      return false;
    }
    logError(error);
    return false;
  }
}
function recoverPlanFromMessages(log) {
  for (let i = log.messages.length - 1; i >= 0; i--) {
    const msg = log.messages[i];
    if (!msg) {
      continue;
    }
    if (msg.type === "assistant") {
      const { content } = msg.message;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_use" && block.name === EXIT_PLAN_MODE_V2_TOOL_NAME) {
            const input = block.input;
            const plan = input?.plan;
            if (typeof plan === "string" && plan.length > 0) {
              return plan;
            }
          }
        }
      }
    }
    if (msg.type === "user") {
      const userMsg = msg;
      if (typeof userMsg.planContent === "string" && userMsg.planContent.length > 0) {
        return userMsg.planContent;
      }
    }
    if (msg.type === "attachment") {
      const attachmentMsg = msg;
      if (attachmentMsg.attachment?.type === "plan_file_reference") {
        const plan = attachmentMsg.attachment.planContent;
        if (typeof plan === "string" && plan.length > 0) {
          return plan;
        }
      }
    }
  }
  return null;
}
function findFileSnapshotEntry(messages, key) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.type === "system" && "subtype" in msg && msg.subtype === "file_snapshot" && "snapshotFiles" in msg) {
      const files = msg.snapshotFiles;
      return files.find((f) => f.key === key);
    }
  }
  return void 0;
}
async function persistFileSnapshotIfRemote() {
  if (getEnvironmentKind() === null) {
    return;
  }
  try {
    const snapshotFiles = [];
    const plan = getPlan();
    if (plan) {
      snapshotFiles.push({
        key: "plan",
        path: getPlanFilePath(),
        content: plan
      });
    }
    if (snapshotFiles.length === 0) {
      return;
    }
    const message = {
      type: "system",
      subtype: "file_snapshot",
      content: "File snapshot",
      level: "info",
      isMeta: true,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      uuid: randomUUID(),
      snapshotFiles
    };
    const { recordTranscript } = await import("./sessionStorage.js");
    await recordTranscript([message]);
  } catch (error) {
    logError(error);
  }
}
export {
  clearAllPlanSlugs,
  clearPlanSlug,
  copyPlanForFork,
  copyPlanForResume,
  getPlan,
  getPlanFilePath,
  getPlanSlug,
  getPlansDirectory,
  persistFileSnapshotIfRemote,
  setPlanSlug
};
