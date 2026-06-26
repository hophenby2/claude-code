import chalk from "chalk";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../../services/analytics/growthbook.js";
import {
  logEvent
} from "../../services/analytics/index.js";
import { queryHaiku } from "../../services/api/claude.js";
import { startsWithApiErrorPrefix } from "../../services/api/errors.js";
import { memoizeWithLRU } from "../memoize.js";
import { jsonStringify } from "../slowOperations.js";
import { asSystemPrompt } from "../systemPromptType.js";
const DANGEROUS_SHELL_PREFIXES = /* @__PURE__ */ new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "csh",
  "tcsh",
  "ksh",
  "dash",
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
  "bash.exe"
]);
function createCommandPrefixExtractor(config) {
  const { toolName, policySpec, eventName, querySource, preCheck } = config;
  const memoized = memoizeWithLRU(
    (command, abortSignal, isNonInteractiveSession) => {
      const promise = getCommandPrefixImpl(
        command,
        abortSignal,
        isNonInteractiveSession,
        toolName,
        policySpec,
        eventName,
        querySource,
        preCheck
      );
      promise.catch(() => {
        if (memoized.cache.get(command) === promise) {
          memoized.cache.delete(command);
        }
      });
      return promise;
    },
    (command) => command,
    // memoize by command only
    200
  );
  return memoized;
}
function createSubcommandPrefixExtractor(getPrefix, splitCommand) {
  const memoized = memoizeWithLRU(
    (command, abortSignal, isNonInteractiveSession) => {
      const promise = getCommandSubcommandPrefixImpl(
        command,
        abortSignal,
        isNonInteractiveSession,
        getPrefix,
        splitCommand
      );
      promise.catch(() => {
        if (memoized.cache.get(command) === promise) {
          memoized.cache.delete(command);
        }
      });
      return promise;
    },
    (command) => command,
    // memoize by command only
    200
  );
  return memoized;
}
async function getCommandPrefixImpl(command, abortSignal, isNonInteractiveSession, toolName, policySpec, eventName, querySource, preCheck) {
  if (process.env.NODE_ENV === "test") {
    return null;
  }
  if (preCheck) {
    const preCheckResult = preCheck(command);
    if (preCheckResult !== null) {
      return preCheckResult;
    }
  }
  let preflightCheckTimeoutId;
  const startTime = Date.now();
  let result = null;
  try {
    preflightCheckTimeoutId = setTimeout(
      (tn, nonInteractive) => {
        const message = `[${tn}Tool] Pre-flight check is taking longer than expected. Run with ANTHROPIC_LOG=debug to check for failed or slow API requests.`;
        if (nonInteractive) {
          process.stderr.write(jsonStringify({ level: "warn", message }) + "\n");
        } else {
          console.warn(chalk.yellow(`\u26A0\uFE0F  ${message}`));
        }
      },
      1e4,
      // 10 seconds
      toolName,
      isNonInteractiveSession
    );
    const useSystemPromptPolicySpec = getFeatureValue_CACHED_MAY_BE_STALE(
      "tengu_cork_m4q",
      false
    );
    const response = await queryHaiku({
      systemPrompt: asSystemPrompt(
        useSystemPromptPolicySpec ? [
          `Your task is to process ${toolName} commands that an AI coding agent wants to run.

${policySpec}`
        ] : [
          `Your task is to process ${toolName} commands that an AI coding agent wants to run.

This policy spec defines how to determine the prefix of a ${toolName} command:`
        ]
      ),
      userPrompt: useSystemPromptPolicySpec ? `Command: ${command}` : `${policySpec}

Command: ${command}`,
      signal: abortSignal,
      options: {
        enablePromptCaching: useSystemPromptPolicySpec,
        querySource,
        agents: [],
        isNonInteractiveSession,
        hasAppendSystemPrompt: false,
        mcpTools: []
      }
    });
    clearTimeout(preflightCheckTimeoutId);
    const durationMs = Date.now() - startTime;
    const prefix = typeof response.message.content === "string" ? response.message.content : Array.isArray(response.message.content) ? response.message.content.find((_) => _.type === "text")?.text ?? "none" : "none";
    if (startsWithApiErrorPrefix(prefix)) {
      logEvent(eventName, {
        success: false,
        error: "API error",
        durationMs
      });
      result = null;
    } else if (prefix === "command_injection_detected") {
      logEvent(eventName, {
        success: false,
        error: "command_injection_detected",
        durationMs
      });
      result = {
        commandPrefix: null
      };
    } else if (prefix === "git" || DANGEROUS_SHELL_PREFIXES.has(prefix.toLowerCase())) {
      logEvent(eventName, {
        success: false,
        error: "dangerous_shell_prefix",
        durationMs
      });
      result = {
        commandPrefix: null
      };
    } else if (prefix === "none") {
      logEvent(eventName, {
        success: false,
        error: 'prefix "none"',
        durationMs
      });
      result = {
        commandPrefix: null
      };
    } else {
      if (!command.startsWith(prefix)) {
        logEvent(eventName, {
          success: false,
          error: "command did not start with prefix",
          durationMs
        });
        result = {
          commandPrefix: null
        };
      } else {
        logEvent(eventName, {
          success: true,
          durationMs
        });
        result = {
          commandPrefix: prefix
        };
      }
    }
    return result;
  } catch (error) {
    clearTimeout(preflightCheckTimeoutId);
    throw error;
  }
}
async function getCommandSubcommandPrefixImpl(command, abortSignal, isNonInteractiveSession, getPrefix, splitCommandFn) {
  const subcommands = await splitCommandFn(command);
  const [fullCommandPrefix, ...subcommandPrefixesResults] = await Promise.all([
    getPrefix(command, abortSignal, isNonInteractiveSession),
    ...subcommands.map(async (subcommand) => ({
      subcommand,
      prefix: await getPrefix(subcommand, abortSignal, isNonInteractiveSession)
    }))
  ]);
  if (!fullCommandPrefix) {
    return null;
  }
  const subcommandPrefixes = subcommandPrefixesResults.reduce(
    (acc, { subcommand, prefix }) => {
      if (prefix) {
        acc.set(subcommand, prefix);
      }
      return acc;
    },
    /* @__PURE__ */ new Map()
  );
  return {
    ...fullCommandPrefix,
    subcommandPrefixes
  };
}
export {
  createCommandPrefixExtractor,
  createSubcommandPrefixExtractor
};
