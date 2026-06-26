import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
import { randomUUID } from "crypto";
import { BashTool } from "../tools/BashTool/BashTool.js";
import { logForDebugging } from "./debug.js";
import { errorMessage, MalformedCommandError, ShellError } from "./errors.js";
import { createAssistantMessage } from "./messages.js";
import { hasPermissionsToUseTool } from "./permissions/permissions.js";
import { processToolResultBlock } from "./toolResultStorage.js";
import { isPowerShellToolEnabled } from "./shell/shellToolUtils.js";
const getPowerShellTool = /* @__PURE__ */ (() => {
  let cached;
  return () => {
    if (!cached) {
      cached = require2("../tools/PowerShellTool/PowerShellTool.js").PowerShellTool;
    }
    return cached;
  };
})();
const BLOCK_PATTERN = /```!\s*\n?([\s\S]*?)\n?```/g;
const INLINE_PATTERN = /(?<=^|\s)!`([^`]+)`/gm;
async function executeShellCommandsInPrompt(text, context, slashCommandName, shell) {
  let result = text;
  const shellTool = shell === "powershell" && isPowerShellToolEnabled() ? getPowerShellTool() : BashTool;
  const blockMatches = text.matchAll(BLOCK_PATTERN);
  const inlineMatches = text.includes("!`") ? text.matchAll(INLINE_PATTERN) : [];
  await Promise.all(
    [...blockMatches, ...inlineMatches].map(async (match) => {
      const command = match[1]?.trim();
      if (command) {
        try {
          const permissionResult = await hasPermissionsToUseTool(
            shellTool,
            { command },
            context,
            createAssistantMessage({ content: [] }),
            ""
          );
          if (permissionResult.behavior !== "allow") {
            logForDebugging(
              `Shell command permission check failed for command in ${slashCommandName}: ${command}. Error: ${permissionResult.message}`
            );
            throw new MalformedCommandError(
              `Shell command permission check failed for pattern "${match[0]}": ${permissionResult.message || "Permission denied"}`
            );
          }
          const { data } = await shellTool.call({ command }, context);
          const toolResultBlock = await processToolResultBlock(
            shellTool,
            data,
            randomUUID()
          );
          const output = typeof toolResultBlock.content === "string" ? toolResultBlock.content : formatBashOutput(data.stdout, data.stderr);
          result = result.replace(match[0], () => output);
        } catch (e) {
          if (e instanceof MalformedCommandError) {
            throw e;
          }
          formatBashError(e, match[0]);
        }
      }
    })
  );
  return result;
}
function formatBashOutput(stdout, stderr, inline = false) {
  const parts = [];
  if (stdout.trim()) {
    parts.push(stdout.trim());
  }
  if (stderr.trim()) {
    if (inline) {
      parts.push(`[stderr: ${stderr.trim()}]`);
    } else {
      parts.push(`[stderr]
${stderr.trim()}`);
    }
  }
  return parts.join(inline ? " " : "\n");
}
function formatBashError(e, pattern, inline = false) {
  if (e instanceof ShellError) {
    if (e.interrupted) {
      throw new MalformedCommandError(
        `Shell command interrupted for pattern "${pattern}": [Command interrupted]`
      );
    }
    const output = formatBashOutput(e.stdout, e.stderr, inline);
    throw new MalformedCommandError(
      `Shell command failed for pattern "${pattern}": ${output}`
    );
  }
  const message = errorMessage(e);
  const formatted = inline ? `[Error: ${message}]` : `[Error]
${message}`;
  throw new MalformedCommandError(formatted);
}
export {
  executeShellCommandsInPrompt
};
