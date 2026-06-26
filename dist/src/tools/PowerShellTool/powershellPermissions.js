import { resolve } from "path";
import { getCwd } from "../../utils/cwd.js";
import { isCurrentDirectoryBareGitRepo } from "../../utils/git.js";
import {
  createPermissionRequestMessage,
  getRuleByContentsForToolName
} from "../../utils/permissions/permissions.js";
import {
  matchWildcardPattern,
  parsePermissionRule,
  suggestionForExactCommand as sharedSuggestionForExactCommand
} from "../../utils/permissions/shellRuleMatching.js";
import {
  classifyCommandName,
  deriveSecurityFlags,
  getAllCommandNames,
  getFileRedirections,
  PS_TOKENIZER_DASH_CHARS,
  parsePowerShellCommand,
  stripModulePrefix
} from "../../utils/powershell/parser.js";
import { containsVulnerableUncPath } from "../../utils/shell/readOnlyCommandValidation.js";
import { isDotGitPathPS, isGitInternalPathPS } from "./gitSafety.js";
import {
  checkPermissionMode,
  isSymlinkCreatingCommand
} from "./modeValidation.js";
import {
  checkPathConstraints,
  dangerousRemovalDeny,
  isDangerousRemovalRawPath
} from "./pathValidation.js";
import { powershellCommandIsSafe } from "./powershellSecurity.js";
import {
  argLeaksValue,
  isAllowlistedCommand,
  isCwdChangingCmdlet,
  isProvablySafeStatement,
  isReadOnlyCommand,
  isSafeOutputCommand,
  resolveToCanonical
} from "./readOnlyValidation.js";
import { POWERSHELL_TOOL_NAME } from "./toolName.js";
const PS_ASSIGN_PREFIX_RE = /^\$[\w:]+\s*(?:[+\-*/%]|\?\?)?\s*=\s*/;
const GIT_SAFETY_WRITE_CMDLETS = /* @__PURE__ */ new Set([
  "new-item",
  "set-content",
  "add-content",
  "out-file",
  "copy-item",
  "move-item",
  "rename-item",
  "expand-archive",
  "invoke-webrequest",
  "invoke-restmethod",
  "tee-object",
  "export-csv",
  "export-clixml"
]);
const GIT_SAFETY_ARCHIVE_EXTRACTORS = /* @__PURE__ */ new Set([
  "tar",
  "tar.exe",
  "bsdtar",
  "bsdtar.exe",
  "unzip",
  "unzip.exe",
  "7z",
  "7z.exe",
  "7za",
  "7za.exe",
  "gzip",
  "gzip.exe",
  "gunzip",
  "gunzip.exe",
  "expand-archive"
]);
async function extractCommandName(command) {
  const trimmed = command.trim();
  if (!trimmed) {
    return "";
  }
  const parsed = await parsePowerShellCommand(trimmed);
  const names = getAllCommandNames(parsed);
  return names[0] ?? "";
}
function powershellPermissionRule(permissionRule) {
  return parsePermissionRule(permissionRule);
}
function suggestionForExactCommand(command) {
  if (command.includes("\n") || command.includes("*")) {
    return [];
  }
  return sharedSuggestionForExactCommand(POWERSHELL_TOOL_NAME, command);
}
function filterRulesByContentsMatchingInput(input, rules, matchMode, behavior) {
  const command = input.command.trim();
  function strEquals(a, b) {
    return a.toLowerCase() === b.toLowerCase();
  }
  function strStartsWith(str, prefix) {
    return str.toLowerCase().startsWith(prefix.toLowerCase());
  }
  function stripModulePrefixForRule(name) {
    if (behavior === "allow") {
      return name;
    }
    return stripModulePrefix(name);
  }
  const rawCmdName = command.split(/\s+/)[0] ?? "";
  const inputCmdName = stripModulePrefix(rawCmdName);
  const inputCanonical = resolveToCanonical(inputCmdName);
  const rest = command.slice(rawCmdName.length).replace(/^\s+/, " ");
  const canonicalCommand = inputCanonical + rest;
  return Array.from(rules.entries()).filter(([ruleContent]) => {
    const rule = powershellPermissionRule(ruleContent);
    function matchesCommand(cmd) {
      switch (rule.type) {
        case "exact":
          return strEquals(rule.command, cmd);
        case "prefix":
          switch (matchMode) {
            case "exact":
              return strEquals(rule.prefix, cmd);
            case "prefix": {
              if (strEquals(cmd, rule.prefix)) {
                return true;
              }
              return strStartsWith(cmd, rule.prefix + " ");
            }
          }
          break;
        case "wildcard":
          if (matchMode === "exact") {
            return false;
          }
          return matchWildcardPattern(rule.pattern, cmd, true);
      }
    }
    if (matchesCommand(command)) {
      return true;
    }
    if (matchesCommand(canonicalCommand)) {
      return true;
    }
    if (rule.type === "exact") {
      const rawRuleCmdName = rule.command.split(/\s+/)[0] ?? "";
      const ruleCanonical = resolveToCanonical(
        stripModulePrefixForRule(rawRuleCmdName)
      );
      if (ruleCanonical === inputCanonical) {
        const ruleRest = rule.command.slice(rawRuleCmdName.length).replace(/^\s+/, " ");
        const inputRest = rest;
        if (strEquals(ruleRest, inputRest)) {
          return true;
        }
      }
    } else if (rule.type === "prefix") {
      const rawRuleCmdName = rule.prefix.split(/\s+/)[0] ?? "";
      const ruleCanonical = resolveToCanonical(
        stripModulePrefixForRule(rawRuleCmdName)
      );
      if (ruleCanonical === inputCanonical) {
        const ruleRest = rule.prefix.slice(rawRuleCmdName.length).replace(/^\s+/, " ");
        const canonicalPrefix = inputCanonical + ruleRest;
        if (matchMode === "exact") {
          if (strEquals(canonicalPrefix, canonicalCommand)) {
            return true;
          }
        } else {
          if (strEquals(canonicalCommand, canonicalPrefix) || strStartsWith(canonicalCommand, canonicalPrefix + " ")) {
            return true;
          }
        }
      }
    } else if (rule.type === "wildcard") {
      const rawRuleCmdName = rule.pattern.split(/\s+/)[0] ?? "";
      const ruleCanonical = resolveToCanonical(
        stripModulePrefixForRule(rawRuleCmdName)
      );
      if (ruleCanonical === inputCanonical && matchMode !== "exact") {
        const ruleRest = rule.pattern.slice(rawRuleCmdName.length).replace(/^\s+/, " ");
        const canonicalPattern = inputCanonical + ruleRest;
        if (matchWildcardPattern(canonicalPattern, canonicalCommand, true)) {
          return true;
        }
      }
    }
    return false;
  }).map(([, rule]) => rule);
}
function matchingRulesForInput(input, toolPermissionContext, matchMode) {
  const denyRuleByContents = getRuleByContentsForToolName(
    toolPermissionContext,
    POWERSHELL_TOOL_NAME,
    "deny"
  );
  const matchingDenyRules = filterRulesByContentsMatchingInput(
    input,
    denyRuleByContents,
    matchMode,
    "deny"
  );
  const askRuleByContents = getRuleByContentsForToolName(
    toolPermissionContext,
    POWERSHELL_TOOL_NAME,
    "ask"
  );
  const matchingAskRules = filterRulesByContentsMatchingInput(
    input,
    askRuleByContents,
    matchMode,
    "ask"
  );
  const allowRuleByContents = getRuleByContentsForToolName(
    toolPermissionContext,
    POWERSHELL_TOOL_NAME,
    "allow"
  );
  const matchingAllowRules = filterRulesByContentsMatchingInput(
    input,
    allowRuleByContents,
    matchMode,
    "allow"
  );
  return { matchingDenyRules, matchingAskRules, matchingAllowRules };
}
function powershellToolCheckExactMatchPermission(input, toolPermissionContext) {
  const trimmedCommand = input.command.trim();
  const { matchingDenyRules, matchingAskRules, matchingAllowRules } = matchingRulesForInput(input, toolPermissionContext, "exact");
  if (matchingDenyRules[0] !== void 0) {
    return {
      behavior: "deny",
      message: `Permission to use ${POWERSHELL_TOOL_NAME} with command ${trimmedCommand} has been denied.`,
      decisionReason: { type: "rule", rule: matchingDenyRules[0] }
    };
  }
  if (matchingAskRules[0] !== void 0) {
    return {
      behavior: "ask",
      message: createPermissionRequestMessage(POWERSHELL_TOOL_NAME),
      decisionReason: { type: "rule", rule: matchingAskRules[0] }
    };
  }
  if (matchingAllowRules[0] !== void 0) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: { type: "rule", rule: matchingAllowRules[0] }
    };
  }
  const decisionReason = {
    type: "other",
    reason: "This command requires approval"
  };
  return {
    behavior: "passthrough",
    message: createPermissionRequestMessage(
      POWERSHELL_TOOL_NAME,
      decisionReason
    ),
    decisionReason,
    suggestions: suggestionForExactCommand(trimmedCommand)
  };
}
function powershellToolCheckPermission(input, toolPermissionContext) {
  const command = input.command.trim();
  const exactMatchResult = powershellToolCheckExactMatchPermission(
    input,
    toolPermissionContext
  );
  if (exactMatchResult.behavior === "deny" || exactMatchResult.behavior === "ask") {
    return exactMatchResult;
  }
  const { matchingDenyRules, matchingAskRules, matchingAllowRules } = matchingRulesForInput(input, toolPermissionContext, "prefix");
  if (matchingDenyRules[0] !== void 0) {
    return {
      behavior: "deny",
      message: `Permission to use ${POWERSHELL_TOOL_NAME} with command ${command} has been denied.`,
      decisionReason: {
        type: "rule",
        rule: matchingDenyRules[0]
      }
    };
  }
  if (matchingAskRules[0] !== void 0) {
    return {
      behavior: "ask",
      message: createPermissionRequestMessage(POWERSHELL_TOOL_NAME),
      decisionReason: {
        type: "rule",
        rule: matchingAskRules[0]
      }
    };
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
  const decisionReason = {
    type: "other",
    reason: "This command requires approval"
  };
  return {
    behavior: "passthrough",
    message: createPermissionRequestMessage(
      POWERSHELL_TOOL_NAME,
      decisionReason
    ),
    decisionReason,
    suggestions: suggestionForExactCommand(command)
  };
}
async function getSubCommandsForPermissionCheck(parsed, originalCommand) {
  if (!parsed.valid) {
    return [
      {
        text: originalCommand,
        element: {
          name: await extractCommandName(originalCommand),
          nameType: "unknown",
          elementType: "CommandAst",
          args: [],
          text: originalCommand
        },
        statement: null,
        isSafeOutput: false
      }
    ];
  }
  const subCommands = [];
  for (const statement of parsed.statements) {
    for (const cmd of statement.commands) {
      if (cmd.elementType !== "CommandAst") {
        continue;
      }
      subCommands.push({
        text: cmd.text,
        element: cmd,
        statement,
        // SECURITY: nameType gate — scripts\\Out-Null strips to Out-Null and
        // would match SAFE_OUTPUT_CMDLETS, but PowerShell runs the .ps1 file.
        // isSafeOutput: true causes step 5 to filter this command out of the
        // approval list, so it would silently execute. See isAllowlistedCommand.
        // SECURITY: args.length === 0 gate — Out-Null -InputObject:(1 > /etc/x)
        // was filtered as safe-output (name-only) → step-5 subCommands empty →
        // auto-allow → redirection inside paren writes file. Only zero-arg
        // Out-String/Out-Null/Out-Host invocations are provably safe.
        isSafeOutput: cmd.nameType !== "application" && isSafeOutputCommand(cmd.name) && cmd.args.length === 0
      });
    }
    if (statement.nestedCommands) {
      for (const cmd of statement.nestedCommands) {
        subCommands.push({
          text: cmd.text,
          element: cmd,
          statement,
          isSafeOutput: cmd.nameType !== "application" && isSafeOutputCommand(cmd.name) && cmd.args.length === 0
        });
      }
    }
  }
  if (subCommands.length > 0) {
    return subCommands;
  }
  return [
    {
      text: originalCommand,
      element: {
        name: await extractCommandName(originalCommand),
        nameType: "unknown",
        elementType: "CommandAst",
        args: [],
        text: originalCommand
      },
      statement: null,
      isSafeOutput: false
    }
  ];
}
async function powershellToolHasPermission(input, context) {
  const toolPermissionContext = context.getAppState().toolPermissionContext;
  const command = input.command.trim();
  if (!command) {
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "Empty command is safe"
      }
    };
  }
  const parsed = await parsePowerShellCommand(command);
  const exactMatchResult = powershellToolCheckExactMatchPermission(
    input,
    toolPermissionContext
  );
  if (exactMatchResult.behavior === "deny") {
    return exactMatchResult;
  }
  const { matchingDenyRules, matchingAskRules } = matchingRulesForInput(
    input,
    toolPermissionContext,
    "prefix"
  );
  if (matchingDenyRules[0] !== void 0) {
    return {
      behavior: "deny",
      message: `Permission to use ${POWERSHELL_TOOL_NAME} with command ${command} has been denied.`,
      decisionReason: {
        type: "rule",
        rule: matchingDenyRules[0]
      }
    };
  }
  let preParseAskDecision = null;
  if (matchingAskRules[0] !== void 0) {
    preParseAskDecision = {
      behavior: "ask",
      message: createPermissionRequestMessage(POWERSHELL_TOOL_NAME),
      decisionReason: {
        type: "rule",
        rule: matchingAskRules[0]
      }
    };
  }
  if (preParseAskDecision === null && containsVulnerableUncPath(command)) {
    preParseAskDecision = {
      behavior: "ask",
      message: "Command contains a UNC path that could trigger network requests"
    };
  }
  if (exactMatchResult.behavior === "allow" && !parsed.valid && preParseAskDecision === null && classifyCommandName(command.split(/\s+/)[0] ?? "") !== "application") {
    return exactMatchResult;
  }
  if (!parsed.valid) {
    const backtickStripped = command.replace(/`[\r\n]+\s*/g, "").replace(/`/g, "");
    for (const fragment of backtickStripped.split(/[;|\n\r{}()&]+/)) {
      const trimmedFrag = fragment.trim();
      if (!trimmedFrag) continue;
      if (trimmedFrag === command && !/^\$[\w:]/.test(trimmedFrag) && !/^[&.]\s/.test(trimmedFrag)) {
        continue;
      }
      let normalized = trimmedFrag;
      let m;
      while (m = normalized.match(PS_ASSIGN_PREFIX_RE)) {
        normalized = normalized.slice(m[0].length);
      }
      normalized = normalized.replace(/^[&.]\s+/, "");
      const rawFirst = normalized.split(/\s+/)[0] ?? "";
      const firstTok = rawFirst.replace(/^['"]|['"]$/g, "");
      const normalizedFrag = firstTok + normalized.slice(rawFirst.length);
      if (resolveToCanonical(firstTok) === "remove-item") {
        for (const arg of normalized.split(/\s+/).slice(1)) {
          if (PS_TOKENIZER_DASH_CHARS.has(arg[0] ?? "")) continue;
          if (isDangerousRemovalRawPath(arg)) {
            return dangerousRemovalDeny(arg);
          }
        }
      }
      const { matchingDenyRules: fragDenyRules } = matchingRulesForInput(
        { command: normalizedFrag },
        toolPermissionContext,
        "prefix"
      );
      if (fragDenyRules[0] !== void 0) {
        return {
          behavior: "deny",
          message: `Permission to use ${POWERSHELL_TOOL_NAME} with command ${command} has been denied.`,
          decisionReason: { type: "rule", rule: fragDenyRules[0] }
        };
      }
    }
    if (preParseAskDecision !== null) {
      return preParseAskDecision;
    }
    const decisionReason2 = {
      type: "other",
      reason: `Command contains malformed syntax that cannot be parsed: ${parsed.errors[0]?.message ?? "unknown error"}`
    };
    return {
      behavior: "ask",
      decisionReason: decisionReason2,
      message: createPermissionRequestMessage(
        POWERSHELL_TOOL_NAME,
        decisionReason2
      )
      // No suggestions - don't recommend persisting invalid syntax
    };
  }
  const allSubCommands = await getSubCommandsForPermissionCheck(parsed, command);
  const decisions = [];
  if (preParseAskDecision !== null) {
    decisions.push(preParseAskDecision);
  }
  const safetyResult = powershellCommandIsSafe(command, parsed);
  if (safetyResult.behavior !== "passthrough") {
    const decisionReason2 = {
      type: "other",
      reason: safetyResult.behavior === "ask" && safetyResult.message ? safetyResult.message : "This command contains patterns that could pose security risks and requires approval"
    };
    decisions.push({
      behavior: "ask",
      message: createPermissionRequestMessage(
        POWERSHELL_TOOL_NAME,
        decisionReason2
      ),
      decisionReason: decisionReason2,
      suggestions: suggestionForExactCommand(command)
    });
  }
  if (parsed.hasUsingStatements) {
    const decisionReason2 = {
      type: "other",
      reason: "Command contains a `using` statement that may load external code (module or assembly)"
    };
    decisions.push({
      behavior: "ask",
      message: createPermissionRequestMessage(
        POWERSHELL_TOOL_NAME,
        decisionReason2
      ),
      decisionReason: decisionReason2,
      suggestions: suggestionForExactCommand(command)
    });
  }
  if (parsed.hasScriptRequirements) {
    const decisionReason2 = {
      type: "other",
      reason: "Command contains a `#Requires` directive that may trigger module loading"
    };
    decisions.push({
      behavior: "ask",
      message: createPermissionRequestMessage(
        POWERSHELL_TOOL_NAME,
        decisionReason2
      ),
      decisionReason: decisionReason2,
      suggestions: suggestionForExactCommand(command)
    });
  }
  const NON_FS_PROVIDER_PATTERN = /^(?:[\w.]+\\)?(env|hklm|hkcu|function|alias|variable|cert|wsman|registry)::?/i;
  function extractProviderPathFromArg(arg) {
    let s = arg;
    if (s.length > 0 && PS_TOKENIZER_DASH_CHARS.has(s[0])) {
      const colonIdx = s.indexOf(":", 1);
      if (colonIdx > 0) {
        s = s.substring(colonIdx + 1);
      }
    }
    return s.replace(/`/g, "");
  }
  function providerOrUncDecisionForArg(arg) {
    const value = extractProviderPathFromArg(arg);
    if (NON_FS_PROVIDER_PATTERN.test(value)) {
      return {
        behavior: "ask",
        message: `Command argument '${arg}' uses a non-filesystem provider path and requires approval`
      };
    }
    if (containsVulnerableUncPath(value)) {
      return {
        behavior: "ask",
        message: `Command argument '${arg}' contains a UNC path that could trigger network requests`
      };
    }
    return null;
  }
  providerScan: for (const statement of parsed.statements) {
    for (const cmd of statement.commands) {
      if (cmd.elementType !== "CommandAst") continue;
      for (const arg of cmd.args) {
        const decision = providerOrUncDecisionForArg(arg);
        if (decision !== null) {
          decisions.push(decision);
          break providerScan;
        }
      }
    }
    if (statement.nestedCommands) {
      for (const cmd of statement.nestedCommands) {
        for (const arg of cmd.args) {
          const decision = providerOrUncDecisionForArg(arg);
          if (decision !== null) {
            decisions.push(decision);
            break providerScan;
          }
        }
      }
    }
  }
  for (const { text: subCmd, element } of allSubCommands) {
    const canonicalSubCmd = element.name !== "" ? [element.name, ...element.args].join(" ") : null;
    const subInput = { command: subCmd };
    const { matchingDenyRules: subDenyRules, matchingAskRules: subAskRules } = matchingRulesForInput(subInput, toolPermissionContext, "prefix");
    let matchedDenyRule = subDenyRules[0];
    let matchedAskRule = subAskRules[0];
    if (matchedDenyRule === void 0 && canonicalSubCmd !== null) {
      const {
        matchingDenyRules: canonicalDenyRules,
        matchingAskRules: canonicalAskRules
      } = matchingRulesForInput(
        { command: canonicalSubCmd },
        toolPermissionContext,
        "prefix"
      );
      matchedDenyRule = canonicalDenyRules[0];
      if (matchedAskRule === void 0) {
        matchedAskRule = canonicalAskRules[0];
      }
    }
    if (matchedDenyRule !== void 0) {
      decisions.push({
        behavior: "deny",
        message: `Permission to use ${POWERSHELL_TOOL_NAME} with command ${command} has been denied.`,
        decisionReason: {
          type: "rule",
          rule: matchedDenyRule
        }
      });
    } else if (matchedAskRule !== void 0) {
      decisions.push({
        behavior: "ask",
        message: createPermissionRequestMessage(POWERSHELL_TOOL_NAME),
        decisionReason: {
          type: "rule",
          rule: matchedAskRule
        }
      });
    }
  }
  const hasCdSubCommand = allSubCommands.length > 1 && allSubCommands.some(({ element }) => isCwdChangingCmdlet(element.name));
  const hasSymlinkCreate = allSubCommands.length > 1 && allSubCommands.some(({ element }) => isSymlinkCreatingCommand(element));
  const hasGitSubCommand = allSubCommands.some(
    ({ element }) => resolveToCanonical(element.name) === "git"
  );
  if (hasCdSubCommand && hasGitSubCommand) {
    decisions.push({
      behavior: "ask",
      message: "Compound commands with cd/Set-Location and git require approval to prevent bare repository attacks"
    });
  }
  if (hasGitSubCommand && isCurrentDirectoryBareGitRepo()) {
    decisions.push({
      behavior: "ask",
      message: "Git command in a directory with bare-repository indicators (HEAD, objects/, refs/ in cwd without .git/HEAD). Git may execute hooks from cwd."
    });
  }
  if (hasGitSubCommand) {
    const writesToGitInternal = allSubCommands.some(
      ({ element, statement }) => {
        for (const r of element.redirections ?? []) {
          if (isGitInternalPathPS(r.target)) return true;
        }
        const canonical = resolveToCanonical(element.name);
        if (!GIT_SAFETY_WRITE_CMDLETS.has(canonical)) return false;
        if (element.args.flatMap((a) => a.split(",")).some((a) => isGitInternalPathPS(a))) {
          return true;
        }
        if (statement !== null) {
          for (const c of statement.commands) {
            if (c.elementType === "CommandAst") continue;
            if (isGitInternalPathPS(c.text)) return true;
          }
        }
        return false;
      }
    );
    const redirWritesToGitInternal = getFileRedirections(parsed).some(
      (r) => isGitInternalPathPS(r.target)
    );
    if (writesToGitInternal || redirWritesToGitInternal) {
      decisions.push({
        behavior: "ask",
        message: "Command writes to a git-internal path (HEAD, objects/, refs/, hooks/, .git/) and runs git. This could plant a malicious hook that git then executes."
      });
    }
    const hasArchiveExtractor = allSubCommands.some(
      ({ element }) => GIT_SAFETY_ARCHIVE_EXTRACTORS.has(element.name.toLowerCase())
    );
    if (hasArchiveExtractor) {
      decisions.push({
        behavior: "ask",
        message: "Compound command extracts an archive and runs git. Archive contents may plant bare-repository indicators (HEAD, hooks/, refs/) that git then treats as the repository root."
      });
    }
  }
  {
    const found = allSubCommands.some(({ element }) => {
      for (const r of element.redirections ?? []) {
        if (isDotGitPathPS(r.target)) return true;
      }
      const canonical = resolveToCanonical(element.name);
      if (!GIT_SAFETY_WRITE_CMDLETS.has(canonical)) return false;
      return element.args.flatMap((a) => a.split(",")).some(isDotGitPathPS);
    }) || getFileRedirections(parsed).some((r) => isDotGitPathPS(r.target));
    if (found) {
      decisions.push({
        behavior: "ask",
        message: "Command writes to .git/ \u2014 hooks or config planted there execute on the next git operation."
      });
    }
  }
  const pathResult = checkPathConstraints(
    input,
    parsed,
    toolPermissionContext,
    hasCdSubCommand
  );
  if (pathResult.behavior !== "passthrough") {
    decisions.push(pathResult);
  }
  if (exactMatchResult.behavior === "allow" && allSubCommands[0] !== void 0 && allSubCommands.every(
    (sc) => sc.element.nameType !== "application" && !argLeaksValue(sc.text, sc.element)
  )) {
    decisions.push(exactMatchResult);
  }
  if (isReadOnlyCommand(command, parsed)) {
    decisions.push({
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "Command is read-only and safe to execute"
      }
    });
  }
  const fileRedirections = getFileRedirections(parsed);
  if (fileRedirections.length > 0) {
    decisions.push({
      behavior: "ask",
      message: "Command contains file redirections that could write to arbitrary paths",
      suggestions: suggestionForExactCommand(command)
    });
  }
  const modeResult = checkPermissionMode(input, parsed, toolPermissionContext);
  if (modeResult.behavior !== "passthrough") {
    decisions.push(modeResult);
  }
  const deniedDecision = decisions.find((d) => d.behavior === "deny");
  if (deniedDecision !== void 0) {
    return deniedDecision;
  }
  const askDecision = decisions.find((d) => d.behavior === "ask");
  if (askDecision !== void 0) {
    return askDecision;
  }
  const allowDecision = decisions.find((d) => d.behavior === "allow");
  if (allowDecision !== void 0) {
    return allowDecision;
  }
  const subCommands = allSubCommands.filter(({ element, isSafeOutput }) => {
    if (isSafeOutput) {
      return false;
    }
    if (element.nameType === "application") {
      return true;
    }
    const canonical = resolveToCanonical(element.name);
    if (canonical === "set-location" && element.args.length > 0) {
      const target = element.args.find(
        (a) => a.length === 0 || !PS_TOKENIZER_DASH_CHARS.has(a[0])
      );
      if (target && resolve(getCwd(), target) === getCwd()) {
        return false;
      }
    }
    return true;
  });
  const subCommandsNeedingApproval = [];
  const statementsSeenInLoop = /* @__PURE__ */ new Set();
  for (const { text: subCmd, element, statement } of subCommands) {
    const subInput = { command: subCmd };
    const subResult = powershellToolCheckPermission(
      subInput,
      toolPermissionContext
    );
    if (subResult.behavior === "deny") {
      return {
        behavior: "deny",
        message: `Permission to use ${POWERSHELL_TOOL_NAME} with command ${command} has been denied.`,
        decisionReason: subResult.decisionReason
      };
    }
    if (subResult.behavior === "ask") {
      if (statement !== null) {
        statementsSeenInLoop.add(statement);
      }
      subCommandsNeedingApproval.push(subCmd);
      continue;
    }
    if (subResult.behavior === "allow" && element.nameType !== "application" && !hasSymlinkCreate) {
      if (argLeaksValue(subCmd, element)) {
        if (statement !== null) {
          statementsSeenInLoop.add(statement);
        }
        subCommandsNeedingApproval.push(subCmd);
        continue;
      }
      continue;
    }
    if (subResult.behavior === "allow") {
      if (statement !== null) {
        statementsSeenInLoop.add(statement);
      }
      subCommandsNeedingApproval.push(subCmd);
      continue;
    }
    if (statement !== null && !hasCdSubCommand && !hasSymlinkCreate && isProvablySafeStatement(statement) && isAllowlistedCommand(element, subCmd)) {
      continue;
    }
    if (statement !== null && !hasCdSubCommand && !hasSymlinkCreate) {
      const subModeResult = checkPermissionMode(
        { command: subCmd },
        {
          valid: true,
          errors: [],
          variables: parsed.variables,
          hasStopParsing: parsed.hasStopParsing,
          originalCommand: subCmd,
          statements: [statement]
        },
        toolPermissionContext
      );
      if (subModeResult.behavior === "allow") {
        continue;
      }
    }
    if (statement !== null) {
      statementsSeenInLoop.add(statement);
    }
    subCommandsNeedingApproval.push(subCmd);
  }
  for (const stmt of parsed.statements) {
    if (!isProvablySafeStatement(stmt) && !statementsSeenInLoop.has(stmt)) {
      subCommandsNeedingApproval.push(stmt.text);
    }
  }
  if (subCommandsNeedingApproval.length === 0) {
    if (deriveSecurityFlags(parsed).hasScriptBlocks) {
      return {
        behavior: "ask",
        message: createPermissionRequestMessage(POWERSHELL_TOOL_NAME),
        decisionReason: {
          type: "other",
          reason: "Pipeline consists of output-formatting cmdlets with script blocks \u2014 block content cannot be verified"
        }
      };
    }
    return {
      behavior: "allow",
      updatedInput: input,
      decisionReason: {
        type: "other",
        reason: "All pipeline commands are individually allowed"
      }
    };
  }
  const decisionReason = {
    type: "other",
    reason: "This command requires approval"
  };
  const pendingSuggestions = [];
  for (const subCmd of subCommandsNeedingApproval) {
    pendingSuggestions.push(...suggestionForExactCommand(subCmd));
  }
  return {
    behavior: "passthrough",
    message: createPermissionRequestMessage(
      POWERSHELL_TOOL_NAME,
      decisionReason
    ),
    decisionReason,
    suggestions: pendingSuggestions
  };
}
export {
  powershellPermissionRule,
  powershellToolCheckExactMatchPermission,
  powershellToolCheckPermission,
  powershellToolHasPermission
};
