import Fuse from "fuse.js";
import {
  formatDescriptionWithSource,
  getCommand,
  getCommandName
} from "../../commands.js";
import { getSkillUsageScore } from "./skillUsageTracking.js";
const SEPARATORS = /[:_-]/g;
let fuseCache = null;
function getCommandFuse(commands) {
  if (fuseCache?.commands === commands) {
    return fuseCache.fuse;
  }
  const commandData = commands.filter((cmd) => !cmd.isHidden).map((cmd) => {
    const commandName = getCommandName(cmd);
    const parts = commandName.split(SEPARATORS).filter(Boolean);
    return {
      descriptionKey: (cmd.description ?? "").split(" ").map((word) => cleanWord(word)).filter(Boolean),
      partKey: parts.length > 1 ? parts : void 0,
      commandName,
      command: cmd,
      aliasKey: cmd.aliases
    };
  });
  const fuse = new Fuse(commandData, {
    includeScore: true,
    threshold: 0.3,
    // relatively strict matching
    location: 0,
    // prefer matches at the beginning of strings
    distance: 100,
    // increased to allow matching in descriptions
    keys: [
      {
        name: "commandName",
        weight: 3
        // Highest priority for command names
      },
      {
        name: "partKey",
        weight: 2
        // Next highest priority for command parts
      },
      {
        name: "aliasKey",
        weight: 2
        // Same high priority for aliases
      },
      {
        name: "descriptionKey",
        weight: 0.5
        // Lower priority for descriptions
      }
    ]
  });
  fuseCache = { commands, fuse };
  return fuse;
}
function isCommandMetadata(metadata) {
  return typeof metadata === "object" && metadata !== null && "name" in metadata && typeof metadata.name === "string" && "type" in metadata;
}
function findMidInputSlashCommand(input, cursorOffset) {
  if (input.startsWith("/")) {
    return null;
  }
  const beforeCursor = input.slice(0, cursorOffset);
  const match = beforeCursor.match(/\s\/([a-zA-Z0-9_:-]*)$/);
  if (!match || match.index === void 0) {
    return null;
  }
  const slashPos = match.index + 1;
  const textAfterSlash = input.slice(slashPos + 1);
  const commandMatch = textAfterSlash.match(/^[a-zA-Z0-9_:-]*/);
  const fullCommand = commandMatch ? commandMatch[0] : "";
  if (cursorOffset > slashPos + 1 + fullCommand.length) {
    return null;
  }
  return {
    token: "/" + fullCommand,
    startPos: slashPos,
    partialCommand: fullCommand
  };
}
function getBestCommandMatch(partialCommand, commands) {
  if (!partialCommand) {
    return null;
  }
  const suggestions = generateCommandSuggestions("/" + partialCommand, commands);
  if (suggestions.length === 0) {
    return null;
  }
  const query = partialCommand.toLowerCase();
  for (const suggestion of suggestions) {
    if (!isCommandMetadata(suggestion.metadata)) {
      continue;
    }
    const name = getCommandName(suggestion.metadata);
    if (name.toLowerCase().startsWith(query)) {
      const suffix = name.slice(partialCommand.length);
      if (suffix) {
        return { suffix, fullCommand: name };
      }
    }
  }
  return null;
}
function isCommandInput(input) {
  return input.startsWith("/");
}
function hasCommandArgs(input) {
  if (!isCommandInput(input)) return false;
  if (!input.includes(" ")) return false;
  if (input.endsWith(" ")) return false;
  return true;
}
function formatCommand(command) {
  return `/${command} `;
}
function getCommandId(cmd) {
  const commandName = getCommandName(cmd);
  if (cmd.type === "prompt") {
    if (cmd.source === "plugin" && cmd.pluginInfo?.repository) {
      return `${commandName}:${cmd.source}:${cmd.pluginInfo.repository}`;
    }
    return `${commandName}:${cmd.source}`;
  }
  return `${commandName}:${cmd.type}`;
}
function findMatchedAlias(query, aliases) {
  if (!aliases || aliases.length === 0 || query === "") {
    return void 0;
  }
  return aliases.find((alias) => alias.toLowerCase().startsWith(query));
}
function createCommandSuggestionItem(cmd, matchedAlias) {
  const commandName = getCommandName(cmd);
  const aliasText = matchedAlias ? ` (${matchedAlias})` : "";
  const isWorkflow = cmd.type === "prompt" && cmd.kind === "workflow";
  const fullDescription = (isWorkflow ? cmd.description : formatDescriptionWithSource(cmd)) + (cmd.type === "prompt" && cmd.argNames?.length ? ` (arguments: ${cmd.argNames.join(", ")})` : "");
  return {
    id: getCommandId(cmd),
    displayText: `/${commandName}${aliasText}`,
    tag: isWorkflow ? "workflow" : void 0,
    description: fullDescription,
    metadata: cmd
  };
}
function generateCommandSuggestions(input, commands) {
  if (!isCommandInput(input)) {
    return [];
  }
  if (hasCommandArgs(input)) {
    return [];
  }
  const query = input.slice(1).toLowerCase().trim();
  if (query === "") {
    const visibleCommands = commands.filter((cmd) => !cmd.isHidden);
    const recentlyUsed = [];
    const commandsWithScores = visibleCommands.filter((cmd) => cmd.type === "prompt").map((cmd) => ({
      cmd,
      score: getSkillUsageScore(getCommandName(cmd))
    })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
    for (const item of commandsWithScores.slice(0, 5)) {
      recentlyUsed.push(item.cmd);
    }
    const recentlyUsedIds = new Set(recentlyUsed.map((cmd) => getCommandId(cmd)));
    const builtinCommands = [];
    const userCommands = [];
    const projectCommands = [];
    const policyCommands = [];
    const otherCommands = [];
    visibleCommands.forEach((cmd) => {
      if (recentlyUsedIds.has(getCommandId(cmd))) {
        return;
      }
      if (cmd.type === "local" || cmd.type === "local-jsx") {
        builtinCommands.push(cmd);
      } else if (cmd.type === "prompt" && (cmd.source === "userSettings" || cmd.source === "localSettings")) {
        userCommands.push(cmd);
      } else if (cmd.type === "prompt" && cmd.source === "projectSettings") {
        projectCommands.push(cmd);
      } else if (cmd.type === "prompt" && cmd.source === "policySettings") {
        policyCommands.push(cmd);
      } else {
        otherCommands.push(cmd);
      }
    });
    const sortAlphabetically = (a, b) => getCommandName(a).localeCompare(getCommandName(b));
    builtinCommands.sort(sortAlphabetically);
    userCommands.sort(sortAlphabetically);
    projectCommands.sort(sortAlphabetically);
    policyCommands.sort(sortAlphabetically);
    otherCommands.sort(sortAlphabetically);
    return [
      ...recentlyUsed,
      ...builtinCommands,
      ...userCommands,
      ...projectCommands,
      ...policyCommands,
      ...otherCommands
    ].map((cmd) => createCommandSuggestionItem(cmd));
  }
  let hiddenExact = commands.find(
    (cmd) => cmd.isHidden && getCommandName(cmd).toLowerCase() === query
  );
  if (hiddenExact && commands.some(
    (cmd) => !cmd.isHidden && getCommandName(cmd).toLowerCase() === query
  )) {
    hiddenExact = void 0;
  }
  const fuse = getCommandFuse(commands);
  const searchResults = fuse.search(query);
  const withMeta = searchResults.map((r) => {
    const name = r.item.commandName.toLowerCase();
    const aliases = r.item.aliasKey?.map((alias) => alias.toLowerCase()) ?? [];
    const usage = r.item.command.type === "prompt" ? getSkillUsageScore(getCommandName(r.item.command)) : 0;
    return { r, name, aliases, usage };
  });
  const sortedResults = withMeta.sort((a, b) => {
    const aName = a.name;
    const bName = b.name;
    const aAliases = a.aliases;
    const bAliases = b.aliases;
    const aExactName = aName === query;
    const bExactName = bName === query;
    if (aExactName && !bExactName) return -1;
    if (bExactName && !aExactName) return 1;
    const aExactAlias = aAliases.some((alias) => alias === query);
    const bExactAlias = bAliases.some((alias) => alias === query);
    if (aExactAlias && !bExactAlias) return -1;
    if (bExactAlias && !aExactAlias) return 1;
    const aPrefixName = aName.startsWith(query);
    const bPrefixName = bName.startsWith(query);
    if (aPrefixName && !bPrefixName) return -1;
    if (bPrefixName && !aPrefixName) return 1;
    if (aPrefixName && bPrefixName && aName.length !== bName.length) {
      return aName.length - bName.length;
    }
    const aPrefixAlias = aAliases.find((alias) => alias.startsWith(query));
    const bPrefixAlias = bAliases.find((alias) => alias.startsWith(query));
    if (aPrefixAlias && !bPrefixAlias) return -1;
    if (bPrefixAlias && !aPrefixAlias) return 1;
    if (aPrefixAlias && bPrefixAlias && aPrefixAlias.length !== bPrefixAlias.length) {
      return aPrefixAlias.length - bPrefixAlias.length;
    }
    const scoreDiff = (a.r.score ?? 0) - (b.r.score ?? 0);
    if (Math.abs(scoreDiff) > 0.1) {
      return scoreDiff;
    }
    return b.usage - a.usage;
  });
  const fuseSuggestions = sortedResults.map((result) => {
    const cmd = result.r.item.command;
    const matchedAlias = findMatchedAlias(query, cmd.aliases);
    return createCommandSuggestionItem(cmd, matchedAlias);
  });
  if (hiddenExact) {
    const hiddenId = getCommandId(hiddenExact);
    if (!fuseSuggestions.some((s) => s.id === hiddenId)) {
      return [createCommandSuggestionItem(hiddenExact), ...fuseSuggestions];
    }
  }
  return fuseSuggestions;
}
function applyCommandSuggestion(suggestion, shouldExecute, commands, onInputChange, setCursorOffset, onSubmit) {
  let commandName;
  let commandObj;
  if (typeof suggestion === "string") {
    commandName = suggestion;
    commandObj = shouldExecute ? getCommand(commandName, commands) : void 0;
  } else {
    if (!isCommandMetadata(suggestion.metadata)) {
      return;
    }
    commandName = getCommandName(suggestion.metadata);
    commandObj = suggestion.metadata;
  }
  const newInput = formatCommand(commandName);
  onInputChange(newInput);
  setCursorOffset(newInput.length);
  if (shouldExecute && commandObj) {
    if (commandObj.type !== "prompt" || (commandObj.argNames ?? []).length === 0) {
      onSubmit(
        newInput,
        /* isSubmittingSlashCommand */
        true
      );
    }
  }
}
function cleanWord(word) {
  return word.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function findSlashCommandPositions(text) {
  const positions = [];
  const regex = /(^|[\s])(\/[a-zA-Z][a-zA-Z0-9:\-_]*)/g;
  let match = null;
  while ((match = regex.exec(text)) !== null) {
    const precedingChar = match[1] ?? "";
    const commandName = match[2] ?? "";
    const start = match.index + precedingChar.length;
    positions.push({ start, end: start + commandName.length });
  }
  return positions;
}
export {
  applyCommandSuggestion,
  findMidInputSlashCommand,
  findSlashCommandPositions,
  formatCommand,
  generateCommandSuggestions,
  getBestCommandMatch,
  hasCommandArgs,
  isCommandInput
};
