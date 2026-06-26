const feature = (_name) => false;
import { APIUserAbortError } from "@anthropic-ai/sdk";
import "../../services/analytics/growthbook.js";
import {
  logEvent
} from "../../services/analytics/index.js";
import { count } from "../../utils/array.js";
import {
  checkSemantics,
  nodeTypeId,
  parseForSecurityFromAst
} from "../../utils/bash/ast.js";
import {
  extractOutputRedirections,
  getCommandSubcommandPrefix,
  splitCommand_DEPRECATED
} from "../../utils/bash/commands.js";
import { parseCommandRaw } from "../../utils/bash/parser.js";
import { tryParseShellCommand } from "../../utils/bash/shellQuote.js";
import { getCwd } from "../../utils/cwd.js";
import { logForDebugging } from "../../utils/debug.js";
import { isEnvTruthy } from "../../utils/envUtils.js";
import { AbortError } from "../../utils/errors.js";
import {
  classifyBashCommand,
  getBashPromptAllowDescriptions,
  getBashPromptAskDescriptions,
  getBashPromptDenyDescriptions,
  isClassifierPermissionsEnabled
} from "../../utils/permissions/bashClassifier.js";
import { extractRules } from "../../utils/permissions/PermissionUpdate.js";
import { permissionRuleValueToString } from "../../utils/permissions/permissionRuleParser.js";
import {
  createPermissionRequestMessage,
  getRuleByContentsForTool
} from "../../utils/permissions/permissions.js";
import {
  parsePermissionRule,
  matchWildcardPattern as sharedMatchWildcardPattern,
  permissionRuleExtractPrefix as sharedPermissionRuleExtractPrefix,
  suggestionForExactCommand as sharedSuggestionForExactCommand,
  suggestionForPrefix as sharedSuggestionForPrefix
} from "../../utils/permissions/shellRuleMatching.js";
import { getPlatform } from "../../utils/platform.js";
import { SandboxManager } from "../../utils/sandbox/sandbox-adapter.js";
import { jsonStringify } from "../../utils/slowOperations.js";
import { windowsPathToPosixPath } from "../../utils/windowsPaths.js";
import { BashTool } from "./BashTool.js";
import { checkCommandOperatorPermissions } from "./bashCommandHelpers.js";
import {
  bashCommandIsSafeAsync_DEPRECATED,
  stripSafeHeredocSubstitutions
} from "./bashSecurity.js";
import { checkPermissionMode } from "./modeValidation.js";
import { checkPathConstraints } from "./pathValidation.js";
import { checkSedConstraints } from "./sedValidation.js";
import { shouldUseSandbox } from "./shouldUseSandbox.js";
const bashCommandIsSafeAsync = bashCommandIsSafeAsync_DEPRECATED;
const splitCommand = splitCommand_DEPRECATED;
const ENV_VAR_ASSIGN_RE = /^[A-Za-z_]\w*=/;
const MAX_SUBCOMMANDS_FOR_SECURITY_CHECK = 50;
const MAX_SUGGESTED_RULES_FOR_COMPOUND = 5;
function logClassifierResultForAnts(command, behavior, descriptions, result) {
  if (process.env.USER_TYPE !== "ant") {
    return;
  }
  logEvent("tengu_internal_bash_classifier_result", {
    behavior,
    descriptions: jsonStringify(
      descriptions
    ),
    matches: result.matches,
    matchedDescription: result.matchedDescription ?? "",
    confidence: result.confidence,
    reason: result.reason,
    // Note: command contains code/filepaths - this is ANT-ONLY so it's OK
    command
  });
}
function getSimpleCommandPrefix(command) {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  let i = 0;
  while (i < tokens.length && ENV_VAR_ASSIGN_RE.test(tokens[i])) {
    const varName = tokens[i].split("=")[0];
    const isAntOnlySafe = process.env.USER_TYPE === "ant" && ANT_ONLY_SAFE_ENV_VARS.has(varName);
    if (!SAFE_ENV_VARS.has(varName) && !isAntOnlySafe) {
      return null;
    }
    i++;
  }
  const remaining = tokens.slice(i);
  if (remaining.length < 2) return null;
  const subcmd = remaining[1];
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(subcmd)) return null;
  return remaining.slice(0, 2).join(" ");
}
const BARE_SHELL_PREFIXES = /* @__PURE__ */ new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "csh",
  "tcsh",
  "ksh",
  "dash",
  "cmd",
  "powershell",
  "pwsh",
  // wrappers that exec their args as a command
  "env",
  "xargs",
  // SECURITY: checkSemantics (ast.ts) strips these wrappers to check the
  // wrapped command. Suggesting `Bash(nice:*)` would be ≈ `Bash(*)` — users
  // would add it after a prompt, then `nice rm -rf /` passes semantics while
  // deny/cd+git gates see 'nice' (SAFE_WRAPPER_PATTERNS below didn't strip
  // bare `nice` until this fix). Block these from ever being suggested.
  "nice",
  "stdbuf",
  "nohup",
  "timeout",
  "time",
  // privilege escalation — sudo:* from `sudo -u foo ...` would auto-approve
  // any future sudo invocation
  "sudo",
  "doas",
  "pkexec"
]);
function getFirstWordPrefix(command) {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < tokens.length && ENV_VAR_ASSIGN_RE.test(tokens[i])) {
    const varName = tokens[i].split("=")[0];
    const isAntOnlySafe = process.env.USER_TYPE === "ant" && ANT_ONLY_SAFE_ENV_VARS.has(varName);
    if (!SAFE_ENV_VARS.has(varName) && !isAntOnlySafe) {
      return null;
    }
    i++;
  }
  const cmd = tokens[i];
  if (!cmd) return null;
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(cmd)) return null;
  if (BARE_SHELL_PREFIXES.has(cmd)) return null;
  return cmd;
}
function suggestionForExactCommand(command) {
  const heredocPrefix = extractPrefixBeforeHeredoc(command);
  if (heredocPrefix) {
    return sharedSuggestionForPrefix(BashTool.name, heredocPrefix);
  }
  if (command.includes("\n")) {
    const firstLine = command.split("\n")[0].trim();
    if (firstLine) {
      return sharedSuggestionForPrefix(BashTool.name, firstLine);
    }
  }
  const prefix = getSimpleCommandPrefix(command);
  if (prefix) {
    return sharedSuggestionForPrefix(BashTool.name, prefix);
  }
  return sharedSuggestionForExactCommand(BashTool.name, command);
}
function extractPrefixBeforeHeredoc(command) {
  if (!command.includes("<<")) return null;
  const idx = command.indexOf("<<");
  if (idx <= 0) return null;
  const before = command.substring(0, idx).trim();
  if (!before) return null;
  const prefix = getSimpleCommandPrefix(before);
  if (prefix) return prefix;
  const tokens = before.split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < tokens.length && ENV_VAR_ASSIGN_RE.test(tokens[i])) {
    const varName = tokens[i].split("=")[0];
    const isAntOnlySafe = process.env.USER_TYPE === "ant" && ANT_ONLY_SAFE_ENV_VARS.has(varName);
    if (!SAFE_ENV_VARS.has(varName) && !isAntOnlySafe) {
      return null;
    }
    i++;
  }
  if (i >= tokens.length) return null;
  return tokens.slice(i, i + 2).join(" ") || null;
}
function suggestionForPrefix(prefix) {
  return sharedSuggestionForPrefix(BashTool.name, prefix);
}
const permissionRuleExtractPrefix = sharedPermissionRuleExtractPrefix;
function matchWildcardPattern(pattern, command) {
  return sharedMatchWildcardPattern(pattern, command);
}
const bashPermissionRule = parsePermissionRule;
const SAFE_ENV_VARS = /* @__PURE__ */ new Set([
  // Go - build/runtime settings only
  "GOEXPERIMENT",
  // experimental features
  "GOOS",
  // target OS
  "GOARCH",
  // target architecture
  "CGO_ENABLED",
  // enable/disable CGO
  "GO111MODULE",
  // module mode
  // Rust - logging/debugging only
  "RUST_BACKTRACE",
  // backtrace verbosity
  "RUST_LOG",
  // logging filter
  // Node - environment name only (not NODE_OPTIONS!)
  "NODE_ENV",
  // Python - behavior flags only (not PYTHONPATH!)
  "PYTHONUNBUFFERED",
  // disable buffering
  "PYTHONDONTWRITEBYTECODE",
  // no .pyc files
  // Pytest - test configuration
  "PYTEST_DISABLE_PLUGIN_AUTOLOAD",
  // disable plugin loading
  "PYTEST_DEBUG",
  // debug output
  // API keys and authentication
  "ANTHROPIC_API_KEY",
  // API authentication
  // Locale and character encoding
  "LANG",
  // default locale
  "LANGUAGE",
  // language preference list
  "LC_ALL",
  // override all locale settings
  "LC_CTYPE",
  // character classification
  "LC_TIME",
  // time format
  "CHARSET",
  // character set preference
  // Terminal and display
  "TERM",
  // terminal type
  "COLORTERM",
  // color terminal indicator
  "NO_COLOR",
  // disable color output (universal standard)
  "FORCE_COLOR",
  // force color output
  "TZ",
  // timezone
  // Color configuration for various tools
  "LS_COLORS",
  // colors for ls (GNU)
  "LSCOLORS",
  // colors for ls (BSD/macOS)
  "GREP_COLOR",
  // grep match color (deprecated)
  "GREP_COLORS",
  // grep color scheme
  "GCC_COLORS",
  // GCC diagnostic colors
  // Display formatting
  "TIME_STYLE",
  // time display format for ls
  "BLOCK_SIZE",
  // block size for du/df
  "BLOCKSIZE"
  // alternative block size
]);
const ANT_ONLY_SAFE_ENV_VARS = /* @__PURE__ */ new Set([
  // Kubernetes and container config (config file pointers, not execution)
  "KUBECONFIG",
  // kubectl config file path — controls which cluster kubectl uses
  "DOCKER_HOST",
  // Docker daemon socket/endpoint — controls which daemon docker talks to
  // Cloud provider project/profile selection (just names/identifiers)
  "AWS_PROFILE",
  // AWS profile name selection
  "CLOUDSDK_CORE_PROJECT",
  // GCP project ID
  "CLUSTER",
  // generic cluster name
  // Anthropic internal cluster selection (just names/identifiers)
  "COO_CLUSTER",
  // coo cluster name
  "COO_CLUSTER_NAME",
  // coo cluster name (alternate)
  "COO_NAMESPACE",
  // coo namespace
  "COO_LAUNCH_YAML_DRY_RUN",
  // dry run mode
  // Feature flags (boolean/string flags only)
  "SKIP_NODE_VERSION_CHECK",
  // skip version check
  "EXPECTTEST_ACCEPT",
  // accept test expectations
  "CI",
  // CI environment indicator
  "GIT_LFS_SKIP_SMUDGE",
  // skip LFS downloads
  // GPU/Device selection (just device IDs)
  "CUDA_VISIBLE_DEVICES",
  // GPU device selection
  "JAX_PLATFORMS",
  // JAX platform selection
  // Display/terminal settings
  "COLUMNS",
  // terminal width
  "TMUX",
  // TMUX socket info
  // Test/debug configuration
  "POSTGRESQL_VERSION",
  // postgres version string
  "FIRESTORE_EMULATOR_HOST",
  // emulator host:port
  "HARNESS_QUIET",
  // quiet mode flag
  "TEST_CROSSCHECK_LISTS_MATCH_UPDATE",
  // test update flag
  "DBT_PER_DEVELOPER_ENVIRONMENTS",
  // DBT config
  "STATSIG_FORD_DB_CHECKS",
  // statsig DB check flag
  // Build configuration
  "ANT_ENVIRONMENT",
  // Anthropic environment name
  "ANT_SERVICE",
  // Anthropic service name
  "MONOREPO_ROOT_DIR",
  // monorepo root path
  // Version selectors
  "PYENV_VERSION",
  // Python version selection
  // Credentials (approved subset - these don't change exfil risk)
  "PGPASSWORD",
  // Postgres password
  "GH_TOKEN",
  // GitHub token
  "GROWTHBOOK_API_KEY"
  // self-hosted growthbook
]);
function stripCommentLines(command) {
  const lines = command.split("\n");
  const nonCommentLines = lines.filter((line) => {
    const trimmed = line.trim();
    return trimmed !== "" && !trimmed.startsWith("#");
  });
  if (nonCommentLines.length === 0) {
    return command;
  }
  return nonCommentLines.join("\n");
}
function stripSafeWrappers(command) {
  const SAFE_WRAPPER_PATTERNS = [
    // timeout: enumerate GNU long flags — no-value (--foreground,
    // --preserve-status, --verbose), value-taking in both =fused and
    // space-separated forms (--kill-after=5, --kill-after 5, --signal=TERM,
    // --signal TERM). Short: -v (no-arg), -k/-s with separate or fused value.
    // SECURITY: flag VALUES use allowlist [A-Za-z0-9_.+-] (signals are
    // TERM/KILL/9, durations are 5/5s/10.5). Previously [^ \t]+ matched
    // $ ( ) ` | ; & — `timeout -k$(id) 10 ls` stripped to `ls`, matched
    // Bash(ls:*), while bash expanded $(id) during word splitting BEFORE
    // timeout ran. Contrast ENV_VAR_PATTERN below which already allowlists.
    /^timeout[ \t]+(?:(?:--(?:foreground|preserve-status|verbose)|--(?:kill-after|signal)=[A-Za-z0-9_.+-]+|--(?:kill-after|signal)[ \t]+[A-Za-z0-9_.+-]+|-v|-[ks][ \t]+[A-Za-z0-9_.+-]+|-[ks][A-Za-z0-9_.+-]+)[ \t]+)*(?:--[ \t]+)?\d+(?:\.\d+)?[smhd]?[ \t]+/,
    /^time[ \t]+(?:--[ \t]+)?/,
    // SECURITY: keep in sync with checkSemantics wrapper-strip (ast.ts
    // ~:1990-2080) AND stripWrappersFromArgv (pathValidation.ts ~:1260).
    // Previously this pattern REQUIRED `-n N`; checkSemantics already handled
    // bare `nice` and legacy `-N`. Asymmetry meant checkSemantics exposed the
    // wrapped command to semantic checks but deny-rule matching and the cd+git
    // gate saw the wrapper name. `nice rm -rf /` with Bash(rm:*) deny became
    // ask instead of deny; `cd evil && nice git status` skipped the bare-repo
    // RCE gate. PR #21503 fixed stripWrappersFromArgv; this was missed.
    // Now matches: `nice cmd`, `nice -n N cmd`, `nice -N cmd` (all forms
    // checkSemantics strips).
    /^nice(?:[ \t]+-n[ \t]+-?\d+|[ \t]+-\d+)?[ \t]+(?:--[ \t]+)?/,
    // stdbuf: fused short flags only (-o0, -eL). checkSemantics handles more
    // (space-separated, long --output=MODE), but we fail-closed on those
    // above so not over-stripping here is safe. Main need: `stdbuf -o0 cmd`.
    /^stdbuf(?:[ \t]+-[ioe][LN0-9]+)+[ \t]+(?:--[ \t]+)?/,
    /^nohup[ \t]+(?:--[ \t]+)?/
  ];
  const ENV_VAR_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)=([A-Za-z0-9_./:-]+)[ \t]+/;
  let stripped = command;
  let previousStripped = "";
  while (stripped !== previousStripped) {
    previousStripped = stripped;
    stripped = stripCommentLines(stripped);
    const envVarMatch = stripped.match(ENV_VAR_PATTERN);
    if (envVarMatch) {
      const varName = envVarMatch[1];
      const isAntOnlySafe = process.env.USER_TYPE === "ant" && ANT_ONLY_SAFE_ENV_VARS.has(varName);
      if (SAFE_ENV_VARS.has(varName) || isAntOnlySafe) {
        stripped = stripped.replace(ENV_VAR_PATTERN, "");
      }
    }
  }
  previousStripped = "";
  while (stripped !== previousStripped) {
    previousStripped = stripped;
    stripped = stripCommentLines(stripped);
    for (const pattern of SAFE_WRAPPER_PATTERNS) {
      stripped = stripped.replace(pattern, "");
    }
  }
  return stripped.trim();
}
const TIMEOUT_FLAG_VALUE_RE = /^[A-Za-z0-9_.+-]+$/;
function skipTimeoutFlags(a) {
  let i = 1;
  while (i < a.length) {
    const arg = a[i];
    const next = a[i + 1];
    if (arg === "--foreground" || arg === "--preserve-status" || arg === "--verbose")
      i++;
    else if (/^--(?:kill-after|signal)=[A-Za-z0-9_.+-]+$/.test(arg)) i++;
    else if ((arg === "--kill-after" || arg === "--signal") && next && TIMEOUT_FLAG_VALUE_RE.test(next))
      i += 2;
    else if (arg === "--") {
      i++;
      break;
    } else if (arg.startsWith("--")) return -1;
    else if (arg === "-v") i++;
    else if ((arg === "-k" || arg === "-s") && next && TIMEOUT_FLAG_VALUE_RE.test(next))
      i += 2;
    else if (/^-[ks][A-Za-z0-9_.+-]+$/.test(arg)) i++;
    else if (arg.startsWith("-")) return -1;
    else break;
  }
  return i;
}
function stripWrappersFromArgv(argv) {
  let a = argv;
  for (; ; ) {
    if (a[0] === "time" || a[0] === "nohup") {
      a = a.slice(a[1] === "--" ? 2 : 1);
    } else if (a[0] === "timeout") {
      const i = skipTimeoutFlags(a);
      if (i < 0 || !a[i] || !/^\d+(?:\.\d+)?[smhd]?$/.test(a[i])) return a;
      a = a.slice(i + 1);
    } else if (a[0] === "nice" && a[1] === "-n" && a[2] && /^-?\d+$/.test(a[2])) {
      a = a.slice(a[3] === "--" ? 4 : 3);
    } else {
      return a;
    }
  }
}
const BINARY_HIJACK_VARS = /^(LD_|DYLD_|PATH$)/;
function stripAllLeadingEnvVars(command, blocklist) {
  const ENV_VAR_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]*\])?)\+?=(?:'[^'\n\r]*'|"(?:\\.|[^"$`\\\n\r])*"|\\.|[^ \t\n\r$`;|&()<>\\\\'"])*[ \t]+/;
  let stripped = command;
  let previousStripped = "";
  while (stripped !== previousStripped) {
    previousStripped = stripped;
    stripped = stripCommentLines(stripped);
    const m = stripped.match(ENV_VAR_PATTERN);
    if (!m) continue;
    if (blocklist?.test(m[1])) break;
    stripped = stripped.slice(m[0].length);
  }
  return stripped.trim();
}
function filterRulesByContentsMatchingInput(input, rules, matchMode, {
  stripAllEnvVars = false,
  skipCompoundCheck = false
} = {}) {
  const command = input.command.trim();
  const commandWithoutRedirections = extractOutputRedirections(command).commandWithoutRedirections;
  const commandsForMatching = matchMode === "exact" ? [command, commandWithoutRedirections] : [commandWithoutRedirections];
  const commandsToTry = commandsForMatching.flatMap((cmd) => {
    const strippedCommand = stripSafeWrappers(cmd);
    return strippedCommand !== cmd ? [cmd, strippedCommand] : [cmd];
  });
  if (stripAllEnvVars) {
    const seen = new Set(commandsToTry);
    let startIdx = 0;
    while (startIdx < commandsToTry.length) {
      const endIdx = commandsToTry.length;
      for (let i = startIdx; i < endIdx; i++) {
        const cmd = commandsToTry[i];
        if (!cmd) {
          continue;
        }
        const envStripped = stripAllLeadingEnvVars(cmd);
        if (!seen.has(envStripped)) {
          commandsToTry.push(envStripped);
          seen.add(envStripped);
        }
        const wrapperStripped = stripSafeWrappers(cmd);
        if (!seen.has(wrapperStripped)) {
          commandsToTry.push(wrapperStripped);
          seen.add(wrapperStripped);
        }
      }
      startIdx = endIdx;
    }
  }
  const isCompoundCommand = /* @__PURE__ */ new Map();
  if (matchMode === "prefix" && !skipCompoundCheck) {
    for (const cmd of commandsToTry) {
      if (!isCompoundCommand.has(cmd)) {
        isCompoundCommand.set(cmd, splitCommand(cmd).length > 1);
      }
    }
  }
  return Array.from(rules.entries()).filter(([ruleContent]) => {
    const bashRule = bashPermissionRule(ruleContent);
    return commandsToTry.some((cmdToMatch) => {
      switch (bashRule.type) {
        case "exact":
          return bashRule.command === cmdToMatch;
        case "prefix":
          switch (matchMode) {
            // In 'exact' mode, only return true if the command exactly matches the prefix rule
            case "exact":
              return bashRule.prefix === cmdToMatch;
            case "prefix": {
              if (isCompoundCommand.get(cmdToMatch)) {
                return false;
              }
              if (cmdToMatch === bashRule.prefix) {
                return true;
              }
              if (cmdToMatch.startsWith(bashRule.prefix + " ")) {
                return true;
              }
              const xargsPrefix = "xargs " + bashRule.prefix;
              if (cmdToMatch === xargsPrefix) {
                return true;
              }
              return cmdToMatch.startsWith(xargsPrefix + " ");
            }
          }
          break;
        case "wildcard":
          if (matchMode === "exact") {
            return false;
          }
          if (isCompoundCommand.get(cmdToMatch)) {
            return false;
          }
          return matchWildcardPattern(bashRule.pattern, cmdToMatch);
      }
    });
  }).map(([, rule]) => rule);
}
function matchingRulesForInput(input, toolPermissionContext, matchMode, { skipCompoundCheck = false } = {}) {
  const denyRuleByContents = getRuleByContentsForTool(
    toolPermissionContext,
    BashTool,
    "deny"
  );
  const matchingDenyRules = filterRulesByContentsMatchingInput(
    input,
    denyRuleByContents,
    matchMode,
    { stripAllEnvVars: true, skipCompoundCheck: true }
  );
  const askRuleByContents = getRuleByContentsForTool(
    toolPermissionContext,
    BashTool,
    "ask"
  );
  const matchingAskRules = filterRulesByContentsMatchingInput(
    input,
    askRuleByContents,
    matchMode,
    { stripAllEnvVars: true, skipCompoundCheck: true }
  );
  const allowRuleByContents = getRuleByContentsForTool(
    toolPermissionContext,
    BashTool,
    "allow"
  );
  const matchingAllowRules = filterRulesByContentsMatchingInput(
    input,
    allowRuleByContents,
    matchMode,
    { skipCompoundCheck }
  );
  return {
    matchingDenyRules,
    matchingAskRules,
    matchingAllowRules
  };
}
const bashToolCheckExactMatchPermission = (input, toolPermissionContext) => {
  const command = input.command.trim();
  const { matchingDenyRules, matchingAskRules, matchingAllowRules } = matchingRulesForInput(input, toolPermissionContext, "exact");
  if (matchingDenyRules[0] !== void 0) {
    return {
      behavior: "deny",
      message: `Permission to use ${BashTool.name} with command ${command} has been denied.`,
      decisionReason: {
        type: "rule",
        rule: matchingDenyRules[0]
      }
    };
  }
  if (matchingAskRules[0] !== void 0) {
    return {
      behavior: "ask",
      message: createPermissionRequestMessage(BashTool.name),
      decisionReason: {
        type: "rule",
        rule: matchingAskRules[0]
      }
    };
  }
  if (matchingAllowRules[0] !== void 0) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "rule",
        rule: matchingAllowRules[0]
      }
    };
  }
  const decisionReason = {
    type: "other",
    reason: "This command requires approval"
  };
  return {
    behavior: "passthrough",
    message: createPermissionRequestMessage(BashTool.name, decisionReason),
    decisionReason,
    // Suggest exact match rule to user
    // this may be overridden by prefix suggestions in `checkCommandAndSuggestRules()`
    suggestions: suggestionForExactCommand(command)
  };
};
const bashToolCheckPermission = (input, toolPermissionContext, compoundCommandHasCd, astCommand) => {
  const command = input.command.trim();
  const exactMatchResult = bashToolCheckExactMatchPermission(
    input,
    toolPermissionContext
  );
  if (exactMatchResult.behavior === "deny" || exactMatchResult.behavior === "ask") {
    return exactMatchResult;
  }
  const { matchingDenyRules, matchingAskRules, matchingAllowRules } = matchingRulesForInput(input, toolPermissionContext, "prefix", {
    skipCompoundCheck: astCommand !== void 0
  });
  if (matchingDenyRules[0] !== void 0) {
    return {
      behavior: "deny",
      message: `Permission to use ${BashTool.name} with command ${command} has been denied.`,
      decisionReason: {
        type: "rule",
        rule: matchingDenyRules[0]
      }
    };
  }
  if (matchingAskRules[0] !== void 0) {
    return {
      behavior: "ask",
      message: createPermissionRequestMessage(BashTool.name),
      decisionReason: {
        type: "rule",
        rule: matchingAskRules[0]
      }
    };
  }
  const pathResult = checkPathConstraints(
    input,
    getCwd(),
    toolPermissionContext,
    compoundCommandHasCd,
    astCommand?.redirects,
    astCommand ? [astCommand] : void 0
  );
  if (pathResult.behavior !== "passthrough") {
    return pathResult;
  }
  if (exactMatchResult.behavior === "allow") {
    return exactMatchResult;
  }
  if (matchingAllowRules[0] !== void 0) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "rule",
        rule: matchingAllowRules[0]
      }
    };
  }
  const sedConstraintResult = checkSedConstraints(input, toolPermissionContext);
  if (sedConstraintResult.behavior !== "passthrough") {
    return sedConstraintResult;
  }
  const modeResult = checkPermissionMode(input, toolPermissionContext);
  if (modeResult.behavior !== "passthrough") {
    return modeResult;
  }
  if (BashTool.isReadOnly(input)) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "Read-only command is allowed"
      }
    };
  }
  const decisionReason = {
    type: "other",
    reason: "This command requires approval"
  };
  return {
    behavior: "passthrough",
    message: createPermissionRequestMessage(BashTool.name, decisionReason),
    decisionReason,
    // Suggest exact match rule to user
    // this may be overridden by prefix suggestions in `checkCommandAndSuggestRules()`
    suggestions: suggestionForExactCommand(command)
  };
};
async function checkCommandAndSuggestRules(input, toolPermissionContext, commandPrefixResult, compoundCommandHasCd, astParseSucceeded) {
  const exactMatchResult = bashToolCheckExactMatchPermission(
    input,
    toolPermissionContext
  );
  if (exactMatchResult.behavior !== "passthrough") {
    return exactMatchResult;
  }
  const permissionResult = bashToolCheckPermission(
    input,
    toolPermissionContext,
    compoundCommandHasCd
  );
  if (permissionResult.behavior === "deny" || permissionResult.behavior === "ask") {
    return permissionResult;
  }
  if (!astParseSucceeded && !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK)) {
    const safetyResult = await bashCommandIsSafeAsync(input.command);
    if (safetyResult.behavior !== "passthrough") {
      const decisionReason = {
        type: "other",
        reason: safetyResult.behavior === "ask" && safetyResult.message ? safetyResult.message : "This command contains patterns that could pose security risks and requires approval"
      };
      return {
        behavior: "ask",
        message: createPermissionRequestMessage(BashTool.name, decisionReason),
        decisionReason,
        suggestions: []
        // Don't suggest saving a potentially dangerous command
      };
    }
  }
  if (permissionResult.behavior === "allow") {
    return permissionResult;
  }
  const suggestedUpdates = commandPrefixResult?.commandPrefix ? suggestionForPrefix(commandPrefixResult.commandPrefix) : suggestionForExactCommand(input.command);
  return {
    ...permissionResult,
    suggestions: suggestedUpdates
  };
}
function checkSandboxAutoAllow(input, toolPermissionContext) {
  const command = input.command.trim();
  const { matchingDenyRules, matchingAskRules } = matchingRulesForInput(
    input,
    toolPermissionContext,
    "prefix"
  );
  if (matchingDenyRules[0] !== void 0) {
    return {
      behavior: "deny",
      message: `Permission to use ${BashTool.name} with command ${command} has been denied.`,
      decisionReason: {
        type: "rule",
        rule: matchingDenyRules[0]
      }
    };
  }
  const subcommands = splitCommand(command);
  if (subcommands.length > 1) {
    let firstAskRule;
    for (const sub of subcommands) {
      const subResult = matchingRulesForInput(
        { command: sub },
        toolPermissionContext,
        "prefix"
      );
      if (subResult.matchingDenyRules[0] !== void 0) {
        return {
          behavior: "deny",
          message: `Permission to use ${BashTool.name} with command ${command} has been denied.`,
          decisionReason: {
            type: "rule",
            rule: subResult.matchingDenyRules[0]
          }
        };
      }
      firstAskRule ??= subResult.matchingAskRules[0];
    }
    if (firstAskRule) {
      return {
        behavior: "ask",
        message: createPermissionRequestMessage(BashTool.name),
        decisionReason: {
          type: "rule",
          rule: firstAskRule
        }
      };
    }
  }
  if (matchingAskRules[0] !== void 0) {
    return {
      behavior: "ask",
      message: createPermissionRequestMessage(BashTool.name),
      decisionReason: {
        type: "rule",
        rule: matchingAskRules[0]
      }
    };
  }
  return {
    behavior: "allow",
    updatedInput: input,
    decisionReason: {
      type: "other",
      reason: "Auto-allowed with sandbox (autoAllowBashIfSandboxed enabled)"
    }
  };
}
function filterCdCwdSubcommands(rawSubcommands, astCommands, cwd, cwdMingw) {
  const subcommands = [];
  const astCommandsByIdx = [];
  for (let i = 0; i < rawSubcommands.length; i++) {
    const cmd = rawSubcommands[i];
    if (cmd === `cd ${cwd}` || cmd === `cd ${cwdMingw}`) continue;
    subcommands.push(cmd);
    astCommandsByIdx.push(astCommands?.[i]);
  }
  return { subcommands, astCommandsByIdx };
}
function checkEarlyExitDeny(input, toolPermissionContext) {
  const exactMatchResult = bashToolCheckExactMatchPermission(
    input,
    toolPermissionContext
  );
  if (exactMatchResult.behavior !== "passthrough") {
    return exactMatchResult;
  }
  const denyMatch = matchingRulesForInput(
    input,
    toolPermissionContext,
    "prefix"
  ).matchingDenyRules[0];
  if (denyMatch !== void 0) {
    return {
      behavior: "deny",
      message: `Permission to use ${BashTool.name} with command ${input.command} has been denied.`,
      decisionReason: { type: "rule", rule: denyMatch }
    };
  }
  return null;
}
function checkSemanticsDeny(input, toolPermissionContext, commands) {
  const fullCmd = checkEarlyExitDeny(input, toolPermissionContext);
  if (fullCmd !== null) return fullCmd;
  for (const cmd of commands) {
    const subDeny = matchingRulesForInput(
      { ...input, command: cmd.text },
      toolPermissionContext,
      "prefix"
    ).matchingDenyRules[0];
    if (subDeny !== void 0) {
      return {
        behavior: "deny",
        message: `Permission to use ${BashTool.name} with command ${input.command} has been denied.`,
        decisionReason: { type: "rule", rule: subDeny }
      };
    }
  }
  return null;
}
function buildPendingClassifierCheck(command, toolPermissionContext) {
  if (!isClassifierPermissionsEnabled()) {
    return void 0;
  }
  if (false)
    return void 0;
  if (toolPermissionContext.mode === "bypassPermissions") return void 0;
  const allowDescriptions = getBashPromptAllowDescriptions(
    toolPermissionContext
  );
  if (allowDescriptions.length === 0) return void 0;
  return {
    command,
    cwd: getCwd(),
    descriptions: allowDescriptions
  };
}
const speculativeChecks = /* @__PURE__ */ new Map();
function peekSpeculativeClassifierCheck(command) {
  return speculativeChecks.get(command);
}
function startSpeculativeClassifierCheck(command, toolPermissionContext, signal, isNonInteractiveSession) {
  if (!isClassifierPermissionsEnabled()) return false;
  if (false)
    return false;
  if (toolPermissionContext.mode === "bypassPermissions") return false;
  const allowDescriptions = getBashPromptAllowDescriptions(
    toolPermissionContext
  );
  if (allowDescriptions.length === 0) return false;
  const cwd = getCwd();
  const promise = classifyBashCommand(
    command,
    cwd,
    allowDescriptions,
    "allow",
    signal,
    isNonInteractiveSession
  );
  promise.catch(() => {
  });
  speculativeChecks.set(command, promise);
  return true;
}
function consumeSpeculativeClassifierCheck(command) {
  const promise = speculativeChecks.get(command);
  if (promise) {
    speculativeChecks.delete(command);
  }
  return promise;
}
function clearSpeculativeChecks() {
  speculativeChecks.clear();
}
async function awaitClassifierAutoApproval(pendingCheck, signal, isNonInteractiveSession) {
  const { command, cwd, descriptions } = pendingCheck;
  const speculativeResult = consumeSpeculativeClassifierCheck(command);
  const classifierResult = speculativeResult ? await speculativeResult : await classifyBashCommand(
    command,
    cwd,
    descriptions,
    "allow",
    signal,
    isNonInteractiveSession
  );
  logClassifierResultForAnts(command, "allow", descriptions, classifierResult);
  if (false) {
    return {
      type: "classifier",
      classifier: "bash_allow",
      reason: `Allowed by prompt rule: "${classifierResult.matchedDescription}"`
    };
  }
  return void 0;
}
async function executeAsyncClassifierCheck(pendingCheck, signal, isNonInteractiveSession, callbacks) {
  const { command, cwd, descriptions } = pendingCheck;
  const speculativeResult = consumeSpeculativeClassifierCheck(command);
  let classifierResult;
  try {
    classifierResult = speculativeResult ? await speculativeResult : await classifyBashCommand(
      command,
      cwd,
      descriptions,
      "allow",
      signal,
      isNonInteractiveSession
    );
  } catch (error) {
    if (error instanceof APIUserAbortError || error instanceof AbortError) {
      callbacks.onComplete?.();
      return;
    }
    callbacks.onComplete?.();
    throw error;
  }
  logClassifierResultForAnts(command, "allow", descriptions, classifierResult);
  if (!callbacks.shouldContinue()) return;
  if (false) {
    callbacks.onAllow({
      type: "classifier",
      classifier: "bash_allow",
      reason: `Allowed by prompt rule: "${classifierResult.matchedDescription}"`
    });
  } else {
    callbacks.onComplete?.();
  }
}
async function bashToolHasPermission(input, context, getCommandSubcommandPrefixFn = getCommandSubcommandPrefix) {
  let appState = context.getAppState();
  const injectionCheckDisabled = isEnvTruthy(
    process.env.CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK
  );
  const shadowEnabled = false ? getFeatureValue_CACHED_MAY_BE_STALE("tengu_birch_trellis", true) : false;
  let astRoot = injectionCheckDisabled ? null : false ? null : await parseCommandRaw(input.command);
  let astResult = astRoot ? parseForSecurityFromAst(input.command, astRoot) : { kind: "parse-unavailable" };
  let astSubcommands = null;
  let astRedirects;
  let astCommands;
  let shadowLegacySubs;
  if (false) {
    const available = astResult.kind !== "parse-unavailable";
    let tooComplex = false;
    let semanticFail = false;
    let subsDiffer = false;
    if (available) {
      tooComplex = astResult.kind === "too-complex";
      semanticFail = astResult.kind === "simple" && !checkSemantics(astResult.commands).ok;
      const tsSubs = astResult.kind === "simple" ? astResult.commands.map((c) => c.text) : void 0;
      const legacySubs = splitCommand(input.command);
      shadowLegacySubs = legacySubs;
      subsDiffer = tsSubs !== void 0 && (tsSubs.length !== legacySubs.length || tsSubs.some((s, i) => s !== legacySubs[i]));
    }
    logEvent("tengu_tree_sitter_shadow", {
      available,
      astTooComplex: tooComplex,
      astSemanticFail: semanticFail,
      subsDiffer,
      injectionCheckDisabled,
      killswitchOff: !shadowEnabled,
      cmdOverLength: input.command.length > 1e4
    });
    astResult = { kind: "parse-unavailable" };
    astRoot = null;
  }
  if (astResult.kind === "too-complex") {
    const earlyExit = checkEarlyExitDeny(input, appState.toolPermissionContext);
    if (earlyExit !== null) return earlyExit;
    const decisionReason2 = {
      type: "other",
      reason: astResult.reason
    };
    logEvent("tengu_bash_ast_too_complex", {
      nodeTypeId: nodeTypeId(astResult.nodeType)
    });
    return {
      behavior: "ask",
      decisionReason: decisionReason2,
      message: createPermissionRequestMessage(BashTool.name, decisionReason2),
      suggestions: [],
      ...false ? {
        pendingClassifierCheck: buildPendingClassifierCheck(
          input.command,
          appState.toolPermissionContext
        )
      } : {}
    };
  }
  if (astResult.kind === "simple") {
    const sem = checkSemantics(astResult.commands);
    if (!sem.ok) {
      const earlyExit = checkSemanticsDeny(
        input,
        appState.toolPermissionContext,
        astResult.commands
      );
      if (earlyExit !== null) return earlyExit;
      const decisionReason2 = {
        type: "other",
        reason: sem.reason
      };
      return {
        behavior: "ask",
        decisionReason: decisionReason2,
        message: createPermissionRequestMessage(BashTool.name, decisionReason2),
        suggestions: []
      };
    }
    astSubcommands = astResult.commands.map((c) => c.text);
    astRedirects = astResult.commands.flatMap((c) => c.redirects);
    astCommands = astResult.commands;
  }
  if (astResult.kind === "parse-unavailable") {
    logForDebugging(
      "bashToolHasPermission: tree-sitter unavailable, using legacy shell-quote path"
    );
    const parseResult = tryParseShellCommand(input.command);
    if (!parseResult.success) {
      const decisionReason2 = {
        type: "other",
        reason: `Command contains malformed syntax that cannot be parsed: ${parseResult.error}`
      };
      return {
        behavior: "ask",
        decisionReason: decisionReason2,
        message: createPermissionRequestMessage(BashTool.name, decisionReason2)
      };
    }
  }
  if (SandboxManager.isSandboxingEnabled() && SandboxManager.isAutoAllowBashIfSandboxedEnabled() && shouldUseSandbox(input)) {
    const sandboxAutoAllowResult = checkSandboxAutoAllow(
      input,
      appState.toolPermissionContext
    );
    if (sandboxAutoAllowResult.behavior !== "passthrough") {
      return sandboxAutoAllowResult;
    }
  }
  const exactMatchResult = bashToolCheckExactMatchPermission(
    input,
    appState.toolPermissionContext
  );
  if (exactMatchResult.behavior === "deny") {
    return exactMatchResult;
  }
  if (isClassifierPermissionsEnabled() && true) {
    const denyDescriptions = getBashPromptDenyDescriptions(
      appState.toolPermissionContext
    );
    const askDescriptions = getBashPromptAskDescriptions(
      appState.toolPermissionContext
    );
    const hasDeny = denyDescriptions.length > 0;
    const hasAsk = askDescriptions.length > 0;
    if (hasDeny || hasAsk) {
      const [denyResult, askResult] = await Promise.all([
        hasDeny ? classifyBashCommand(
          input.command,
          getCwd(),
          denyDescriptions,
          "deny",
          context.abortController.signal,
          context.options.isNonInteractiveSession
        ) : null,
        hasAsk ? classifyBashCommand(
          input.command,
          getCwd(),
          askDescriptions,
          "ask",
          context.abortController.signal,
          context.options.isNonInteractiveSession
        ) : null
      ]);
      if (context.abortController.signal.aborted) {
        throw new AbortError();
      }
      if (denyResult) {
        logClassifierResultForAnts(
          input.command,
          "deny",
          denyDescriptions,
          denyResult
        );
      }
      if (askResult) {
        logClassifierResultForAnts(
          input.command,
          "ask",
          askDescriptions,
          askResult
        );
      }
      if (denyResult?.matches && denyResult.confidence === "high") {
        return {
          behavior: "deny",
          message: `Denied by Bash prompt rule: "${denyResult.matchedDescription}"`,
          decisionReason: {
            type: "other",
            reason: `Denied by Bash prompt rule: "${denyResult.matchedDescription}"`
          }
        };
      }
      if (askResult?.matches && askResult.confidence === "high") {
        let suggestions;
        if (getCommandSubcommandPrefixFn === getCommandSubcommandPrefix) {
          suggestions = suggestionForExactCommand(input.command);
        } else {
          const commandPrefixResult = await getCommandSubcommandPrefixFn(
            input.command,
            context.abortController.signal,
            context.options.isNonInteractiveSession
          );
          if (context.abortController.signal.aborted) {
            throw new AbortError();
          }
          suggestions = commandPrefixResult?.commandPrefix ? suggestionForPrefix(commandPrefixResult.commandPrefix) : suggestionForExactCommand(input.command);
        }
        return {
          behavior: "ask",
          message: createPermissionRequestMessage(BashTool.name),
          decisionReason: {
            type: "other",
            reason: `Required by Bash prompt rule: "${askResult.matchedDescription}"`
          },
          suggestions,
          ...false ? {
            pendingClassifierCheck: buildPendingClassifierCheck(
              input.command,
              appState.toolPermissionContext
            )
          } : {}
        };
      }
    }
  }
  const commandOperatorResult = await checkCommandOperatorPermissions(
    input,
    (i) => bashToolHasPermission(i, context, getCommandSubcommandPrefixFn),
    { isNormalizedCdCommand, isNormalizedGitCommand },
    astRoot
  );
  if (commandOperatorResult.behavior !== "passthrough") {
    if (commandOperatorResult.behavior === "allow") {
      const safetyResult = astSubcommands === null ? await bashCommandIsSafeAsync(input.command) : null;
      if (safetyResult !== null && safetyResult.behavior !== "passthrough" && safetyResult.behavior !== "allow") {
        appState = context.getAppState();
        return {
          behavior: "ask",
          message: createPermissionRequestMessage(BashTool.name, {
            type: "other",
            reason: safetyResult.message ?? "Command contains patterns that require approval"
          }),
          decisionReason: {
            type: "other",
            reason: safetyResult.message ?? "Command contains patterns that require approval"
          },
          ...false ? {
            pendingClassifierCheck: buildPendingClassifierCheck(
              input.command,
              appState.toolPermissionContext
            )
          } : {}
        };
      }
      appState = context.getAppState();
      const pathResult2 = checkPathConstraints(
        input,
        getCwd(),
        appState.toolPermissionContext,
        commandHasAnyCd(input.command),
        astRedirects,
        astCommands
      );
      if (pathResult2.behavior !== "passthrough") {
        return pathResult2;
      }
    }
    if (commandOperatorResult.behavior === "ask") {
      appState = context.getAppState();
      return {
        ...commandOperatorResult,
        ...false ? {
          pendingClassifierCheck: buildPendingClassifierCheck(
            input.command,
            appState.toolPermissionContext
          )
        } : {}
      };
    }
    return commandOperatorResult;
  }
  if (astSubcommands === null && !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK)) {
    const originalCommandSafetyResult = await bashCommandIsSafeAsync(
      input.command
    );
    if (originalCommandSafetyResult.behavior === "ask" && originalCommandSafetyResult.isBashSecurityCheckForMisparsing) {
      const remainder = stripSafeHeredocSubstitutions(input.command);
      const remainderResult = remainder !== null ? await bashCommandIsSafeAsync(remainder) : null;
      if (remainder === null || remainderResult?.behavior === "ask" && remainderResult.isBashSecurityCheckForMisparsing) {
        appState = context.getAppState();
        const exactMatchResult2 = bashToolCheckExactMatchPermission(
          input,
          appState.toolPermissionContext
        );
        if (exactMatchResult2.behavior === "allow") {
          return exactMatchResult2;
        }
        const decisionReason2 = {
          type: "other",
          reason: originalCommandSafetyResult.message
        };
        return {
          behavior: "ask",
          message: createPermissionRequestMessage(
            BashTool.name,
            decisionReason2
          ),
          decisionReason: decisionReason2,
          suggestions: [],
          // Don't suggest saving a potentially dangerous command
          ...false ? {
            pendingClassifierCheck: buildPendingClassifierCheck(
              input.command,
              appState.toolPermissionContext
            )
          } : {}
        };
      }
    }
  }
  const cwd = getCwd();
  const cwdMingw = getPlatform() === "windows" ? windowsPathToPosixPath(cwd) : cwd;
  const rawSubcommands = astSubcommands ?? shadowLegacySubs ?? splitCommand(input.command);
  const { subcommands, astCommandsByIdx } = filterCdCwdSubcommands(
    rawSubcommands,
    astCommands,
    cwd,
    cwdMingw
  );
  if (astSubcommands === null && subcommands.length > MAX_SUBCOMMANDS_FOR_SECURITY_CHECK) {
    logForDebugging(
      `bashPermissions: ${subcommands.length} subcommands exceeds cap (${MAX_SUBCOMMANDS_FOR_SECURITY_CHECK}) \u2014 returning ask`,
      { level: "debug" }
    );
    const decisionReason2 = {
      type: "other",
      reason: `Command splits into ${subcommands.length} subcommands, too many to safety-check individually`
    };
    return {
      behavior: "ask",
      message: createPermissionRequestMessage(BashTool.name, decisionReason2),
      decisionReason: decisionReason2
    };
  }
  const cdCommands = subcommands.filter(
    (subCommand) => isNormalizedCdCommand(subCommand)
  );
  if (cdCommands.length > 1) {
    const decisionReason2 = {
      type: "other",
      reason: "Multiple directory changes in one command require approval for clarity"
    };
    return {
      behavior: "ask",
      decisionReason: decisionReason2,
      message: createPermissionRequestMessage(BashTool.name, decisionReason2)
    };
  }
  const compoundCommandHasCd = cdCommands.length > 0;
  if (compoundCommandHasCd) {
    const hasGitCommand = subcommands.some(
      (cmd) => isNormalizedGitCommand(cmd.trim())
    );
    if (hasGitCommand) {
      const decisionReason2 = {
        type: "other",
        reason: "Compound commands with cd and git require approval to prevent bare repository attacks"
      };
      return {
        behavior: "ask",
        decisionReason: decisionReason2,
        message: createPermissionRequestMessage(BashTool.name, decisionReason2)
      };
    }
  }
  appState = context.getAppState();
  const subcommandPermissionDecisions = subcommands.map(
    (command, i) => bashToolCheckPermission(
      { command },
      appState.toolPermissionContext,
      compoundCommandHasCd,
      astCommandsByIdx[i]
    )
  );
  const deniedSubresult = subcommandPermissionDecisions.find(
    (_) => _.behavior === "deny"
  );
  if (deniedSubresult !== void 0) {
    return {
      behavior: "deny",
      message: `Permission to use ${BashTool.name} with command ${input.command} has been denied.`,
      decisionReason: {
        type: "subcommandResults",
        reasons: new Map(
          subcommandPermissionDecisions.map((result, i) => [
            subcommands[i],
            result
          ])
        )
      }
    };
  }
  const pathResult = checkPathConstraints(
    input,
    getCwd(),
    appState.toolPermissionContext,
    compoundCommandHasCd,
    astRedirects,
    astCommands
  );
  if (pathResult.behavior === "deny") {
    return pathResult;
  }
  const askSubresult = subcommandPermissionDecisions.find(
    (_) => _.behavior === "ask"
  );
  const nonAllowCount = count(
    subcommandPermissionDecisions,
    (_) => _.behavior !== "allow"
  );
  if (pathResult.behavior === "ask" && askSubresult === void 0) {
    return pathResult;
  }
  if (askSubresult !== void 0 && nonAllowCount === 1) {
    return {
      ...askSubresult,
      ...false ? {
        pendingClassifierCheck: buildPendingClassifierCheck(
          input.command,
          appState.toolPermissionContext
        )
      } : {}
    };
  }
  if (exactMatchResult.behavior === "allow") {
    return exactMatchResult;
  }
  let hasPossibleCommandInjection = false;
  if (astSubcommands === null && !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK)) {
    let divergenceCount = 0;
    const onDivergence = () => {
      divergenceCount++;
    };
    const results = await Promise.all(
      subcommands.map((c) => bashCommandIsSafeAsync(c, onDivergence))
    );
    hasPossibleCommandInjection = results.some(
      (r) => r.behavior !== "passthrough"
    );
    if (divergenceCount > 0) {
      logEvent("tengu_tree_sitter_security_divergence", {
        quoteContextDivergence: true,
        count: divergenceCount
      });
    }
  }
  if (subcommandPermissionDecisions.every((_) => _.behavior === "allow") && !hasPossibleCommandInjection) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "subcommandResults",
        reasons: new Map(
          subcommandPermissionDecisions.map((result, i) => [
            subcommands[i],
            result
          ])
        )
      }
    };
  }
  let commandSubcommandPrefix = null;
  if (getCommandSubcommandPrefixFn !== getCommandSubcommandPrefix) {
    commandSubcommandPrefix = await getCommandSubcommandPrefixFn(
      input.command,
      context.abortController.signal,
      context.options.isNonInteractiveSession
    );
    if (context.abortController.signal.aborted) {
      throw new AbortError();
    }
  }
  appState = context.getAppState();
  if (subcommands.length === 1) {
    const result = await checkCommandAndSuggestRules(
      { command: subcommands[0] },
      appState.toolPermissionContext,
      commandSubcommandPrefix,
      compoundCommandHasCd,
      astSubcommands !== null
    );
    if (result.behavior === "ask" || result.behavior === "passthrough") {
      return {
        ...result,
        ...false ? {
          pendingClassifierCheck: buildPendingClassifierCheck(
            input.command,
            appState.toolPermissionContext
          )
        } : {}
      };
    }
    return result;
  }
  const subcommandResults = /* @__PURE__ */ new Map();
  for (const subcommand of subcommands) {
    subcommandResults.set(
      subcommand,
      await checkCommandAndSuggestRules(
        {
          // Pass through input params like `sandbox`
          ...input,
          command: subcommand
        },
        appState.toolPermissionContext,
        commandSubcommandPrefix?.subcommandPrefixes.get(subcommand),
        compoundCommandHasCd,
        astSubcommands !== null
      )
    );
  }
  if (subcommands.every((subcommand) => {
    const permissionResult = subcommandResults.get(subcommand);
    return permissionResult?.behavior === "allow";
  })) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "subcommandResults",
        reasons: subcommandResults
      }
    };
  }
  const collectedRules = /* @__PURE__ */ new Map();
  for (const [subcommand, permissionResult] of subcommandResults) {
    if (permissionResult.behavior === "ask" || permissionResult.behavior === "passthrough") {
      const updates = "suggestions" in permissionResult ? permissionResult.suggestions : void 0;
      const rules = extractRules(updates);
      for (const rule of rules) {
        const ruleKey = permissionRuleValueToString(rule);
        collectedRules.set(ruleKey, rule);
      }
      if (permissionResult.behavior === "ask" && rules.length === 0 && permissionResult.decisionReason?.type !== "rule") {
        for (const rule of extractRules(
          suggestionForExactCommand(subcommand)
        )) {
          const ruleKey = permissionRuleValueToString(rule);
          collectedRules.set(ruleKey, rule);
        }
      }
    }
  }
  const decisionReason = {
    type: "subcommandResults",
    reasons: subcommandResults
  };
  const cappedRules = Array.from(collectedRules.values()).slice(
    0,
    MAX_SUGGESTED_RULES_FOR_COMPOUND
  );
  const suggestedUpdates = cappedRules.length > 0 ? [
    {
      type: "addRules",
      rules: cappedRules,
      behavior: "allow",
      destination: "localSettings"
    }
  ] : void 0;
  return {
    behavior: askSubresult !== void 0 ? "ask" : "passthrough",
    message: createPermissionRequestMessage(BashTool.name, decisionReason),
    decisionReason,
    suggestions: suggestedUpdates,
    ...false ? {
      pendingClassifierCheck: buildPendingClassifierCheck(
        input.command,
        appState.toolPermissionContext
      )
    } : {}
  };
}
function isNormalizedGitCommand(command) {
  if (command.startsWith("git ") || command === "git") {
    return true;
  }
  const stripped = stripSafeWrappers(command);
  const parsed = tryParseShellCommand(stripped);
  if (parsed.success && parsed.tokens.length > 0) {
    if (parsed.tokens[0] === "git") {
      return true;
    }
    if (parsed.tokens[0] === "xargs" && parsed.tokens.includes("git")) {
      return true;
    }
    return false;
  }
  return /^git(?:\s|$)/.test(stripped);
}
function isNormalizedCdCommand(command) {
  const stripped = stripSafeWrappers(command);
  const parsed = tryParseShellCommand(stripped);
  if (parsed.success && parsed.tokens.length > 0) {
    const cmd = parsed.tokens[0];
    return cmd === "cd" || cmd === "pushd" || cmd === "popd";
  }
  return /^(?:cd|pushd|popd)(?:\s|$)/.test(stripped);
}
function commandHasAnyCd(command) {
  return splitCommand(command).some(
    (subcmd) => isNormalizedCdCommand(subcmd.trim())
  );
}
export {
  BINARY_HIJACK_VARS,
  MAX_SUBCOMMANDS_FOR_SECURITY_CHECK,
  MAX_SUGGESTED_RULES_FOR_COMPOUND,
  awaitClassifierAutoApproval,
  bashPermissionRule,
  bashToolCheckExactMatchPermission,
  bashToolCheckPermission,
  bashToolHasPermission,
  checkCommandAndSuggestRules,
  clearSpeculativeChecks,
  commandHasAnyCd,
  consumeSpeculativeClassifierCheck,
  executeAsyncClassifierCheck,
  getFirstWordPrefix,
  getSimpleCommandPrefix,
  isNormalizedCdCommand,
  isNormalizedGitCommand,
  matchWildcardPattern,
  peekSpeculativeClassifierCheck,
  permissionRuleExtractPrefix,
  startSpeculativeClassifierCheck,
  stripAllLeadingEnvVars,
  stripSafeWrappers,
  stripWrappersFromArgv
};
