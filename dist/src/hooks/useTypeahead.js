import { jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotifications } from "../context/notifications.js";
import { Text } from "../ink.js";
import { logEvent } from "../services/analytics/index.js";
import { useDebounceCallback } from "usehooks-ts";
import { getCommandName } from "../commands.js";
import { getModeFromInput, getValueFromInput } from "../components/PromptInput/inputModes.js";
import { useIsModalOverlayActive, useRegisterOverlay } from "../context/overlayContext.js";
import { KeyboardEvent } from "../ink/events/keyboard-event.js";
import { useInput } from "../ink.js";
import { useOptionalKeybindingContext, useRegisterKeybindingContext } from "../keybindings/KeybindingContext.js";
import { useKeybindings } from "../keybindings/useKeybinding.js";
import { useShortcutDisplay } from "../keybindings/useShortcutDisplay.js";
import { useAppState, useAppStateStore } from "../state/AppState.js";
import { isAgentSwarmsEnabled } from "../utils/agentSwarmsEnabled.js";
import { generateProgressiveArgumentHint, parseArguments } from "../utils/argumentSubstitution.js";
import { getShellCompletions } from "../utils/bash/shellCompletion.js";
import { isBareMode, isTuiSmokeTestMode } from "../utils/envUtils.js";
import { formatLogMetadata } from "../utils/format.js";
import { getSessionIdFromLog, searchSessionsByCustomTitle } from "../utils/sessionStorage.js";
import { applyCommandSuggestion, findMidInputSlashCommand, generateCommandSuggestions, getBestCommandMatch, isCommandInput } from "../utils/suggestions/commandSuggestions.js";
import { getDirectoryCompletions, getPathCompletions, isPathLikeToken } from "../utils/suggestions/directoryCompletion.js";
import { getShellHistoryCompletion } from "../utils/suggestions/shellHistoryCompletion.js";
import { getSlackChannelSuggestions, hasSlackMcpServer } from "../utils/suggestions/slackChannelSuggestions.js";
import { TEAM_LEAD_NAME } from "../utils/swarm/constants.js";
import { applyFileSuggestion, findLongestCommonPrefix, onIndexBuildComplete, startBackgroundCacheRefresh } from "./fileSuggestions.js";
import { generateUnifiedSuggestions } from "./unifiedSuggestions.js";
const AT_TOKEN_HEAD_RE = /^@[\p{L}\p{N}\p{M}_\-./\\()[\]~:]*/u;
const PATH_CHAR_HEAD_RE = /^[\p{L}\p{N}\p{M}_\-./\\()[\]~:]+/u;
const TOKEN_WITH_AT_RE = /(@[\p{L}\p{N}\p{M}_\-./\\()[\]~:]*|[\p{L}\p{N}\p{M}_\-./\\()[\]~:]+)$/u;
const TOKEN_WITHOUT_AT_RE = /[\p{L}\p{N}\p{M}_\-./\\()[\]~:]+$/u;
const HAS_AT_SYMBOL_RE = /(^|\s)@([\p{L}\p{N}\p{M}_\-./\\()[\]~:]*|"[^"]*"?)$/u;
const HASH_CHANNEL_RE = /(^|\s)#([a-z0-9][a-z0-9_-]*)$/;
function isPathMetadata(metadata) {
  return typeof metadata === "object" && metadata !== null && "type" in metadata && (metadata.type === "directory" || metadata.type === "file");
}
function getPreservedSelection(prevSuggestions, prevSelection, newSuggestions) {
  if (newSuggestions.length === 0) {
    return -1;
  }
  if (prevSelection < 0) {
    return 0;
  }
  const prevSelectedItem = prevSuggestions[prevSelection];
  if (!prevSelectedItem) {
    return 0;
  }
  const newIndex = newSuggestions.findIndex((item) => item.id === prevSelectedItem.id);
  return newIndex >= 0 ? newIndex : 0;
}
function buildResumeInputFromSuggestion(suggestion) {
  const metadata = suggestion.metadata;
  return metadata?.sessionId ? `/resume ${metadata.sessionId}` : `/resume ${suggestion.displayText}`;
}
function extractSearchToken(completionToken) {
  if (completionToken.isQuoted) {
    return completionToken.token.slice(2).replace(/"$/, "");
  } else if (completionToken.token.startsWith("@")) {
    return completionToken.token.substring(1);
  } else {
    return completionToken.token;
  }
}
function formatReplacementValue(options) {
  const {
    displayText,
    mode,
    hasAtPrefix,
    needsQuotes,
    isQuoted,
    isComplete
  } = options;
  const space = isComplete ? " " : "";
  if (isQuoted || needsQuotes) {
    return mode === "bash" ? `"${displayText}"${space}` : `@"${displayText}"${space}`;
  } else if (hasAtPrefix) {
    return mode === "bash" ? `${displayText}${space}` : `@${displayText}${space}`;
  } else {
    return displayText;
  }
}
function applyShellSuggestion(suggestion, input, cursorOffset, onInputChange, setCursorOffset, completionType) {
  const beforeCursor = input.slice(0, cursorOffset);
  const lastSpaceIndex = beforeCursor.lastIndexOf(" ");
  const wordStart = lastSpaceIndex + 1;
  let replacementText;
  if (completionType === "variable") {
    replacementText = "$" + suggestion.displayText + " ";
  } else if (completionType === "command") {
    replacementText = suggestion.displayText + " ";
  } else {
    replacementText = suggestion.displayText;
  }
  const newInput = input.slice(0, wordStart) + replacementText + input.slice(cursorOffset);
  onInputChange(newInput);
  setCursorOffset(wordStart + replacementText.length);
}
const DM_MEMBER_RE = /(^|\s)@[\w-]*$/;
function applyTriggerSuggestion(suggestion, input, cursorOffset, triggerRe, onInputChange, setCursorOffset) {
  const m = input.slice(0, cursorOffset).match(triggerRe);
  if (!m || m.index === void 0) return;
  const prefixStart = m.index + (m[1]?.length ?? 0);
  const before = input.slice(0, prefixStart);
  const newInput = before + suggestion.displayText + " " + input.slice(cursorOffset);
  onInputChange(newInput);
  setCursorOffset(before.length + suggestion.displayText.length + 1);
}
let currentShellCompletionAbortController = null;
async function generateBashSuggestions(input, cursorOffset) {
  try {
    if (currentShellCompletionAbortController) {
      currentShellCompletionAbortController.abort();
    }
    currentShellCompletionAbortController = new AbortController();
    const suggestions = await getShellCompletions(input, cursorOffset, currentShellCompletionAbortController.signal);
    return suggestions;
  } catch {
    logEvent("tengu_shell_completion_failed", {});
    return [];
  }
}
function applyDirectorySuggestion(input, suggestionId, tokenStartPos, tokenLength, isDirectory) {
  const suffix = isDirectory ? "/" : " ";
  const before = input.slice(0, tokenStartPos);
  const after = input.slice(tokenStartPos + tokenLength);
  const replacement = "@" + suggestionId + suffix;
  const newInput = before + replacement + after;
  return {
    newInput,
    cursorPos: before.length + replacement.length
  };
}
function extractCompletionToken(text, cursorPos, includeAtSymbol = false) {
  if (!text) return null;
  const textBeforeCursor = text.substring(0, cursorPos);
  if (includeAtSymbol) {
    const quotedAtRegex = /@"([^"]*)"?$/;
    const quotedMatch = textBeforeCursor.match(quotedAtRegex);
    if (quotedMatch && quotedMatch.index !== void 0) {
      const textAfterCursor2 = text.substring(cursorPos);
      const afterQuotedMatch = textAfterCursor2.match(/^[^"]*"?/);
      const quotedSuffix = afterQuotedMatch ? afterQuotedMatch[0] : "";
      return {
        token: quotedMatch[0] + quotedSuffix,
        startPos: quotedMatch.index,
        isQuoted: true
      };
    }
  }
  if (includeAtSymbol) {
    const atIdx = textBeforeCursor.lastIndexOf("@");
    if (atIdx >= 0 && (atIdx === 0 || /\s/.test(textBeforeCursor[atIdx - 1]))) {
      const fromAt = textBeforeCursor.substring(atIdx);
      const atHeadMatch = fromAt.match(AT_TOKEN_HEAD_RE);
      if (atHeadMatch && atHeadMatch[0].length === fromAt.length) {
        const textAfterCursor2 = text.substring(cursorPos);
        const afterMatch2 = textAfterCursor2.match(PATH_CHAR_HEAD_RE);
        const tokenSuffix2 = afterMatch2 ? afterMatch2[0] : "";
        return {
          token: atHeadMatch[0] + tokenSuffix2,
          startPos: atIdx,
          isQuoted: false
        };
      }
    }
  }
  const tokenRegex = includeAtSymbol ? TOKEN_WITH_AT_RE : TOKEN_WITHOUT_AT_RE;
  const match = textBeforeCursor.match(tokenRegex);
  if (!match || match.index === void 0) {
    return null;
  }
  const textAfterCursor = text.substring(cursorPos);
  const afterMatch = textAfterCursor.match(PATH_CHAR_HEAD_RE);
  const tokenSuffix = afterMatch ? afterMatch[0] : "";
  return {
    token: match[0] + tokenSuffix,
    startPos: match.index,
    isQuoted: false
  };
}
function extractCommandNameAndArgs(value) {
  if (isCommandInput(value)) {
    const spaceIndex = value.indexOf(" ");
    if (spaceIndex === -1) return {
      commandName: value.slice(1),
      args: ""
    };
    return {
      commandName: value.slice(1, spaceIndex),
      args: value.slice(spaceIndex + 1)
    };
  }
  return null;
}
function hasCommandWithArguments(isAtEndWithWhitespace, value) {
  return !isAtEndWithWhitespace && value.includes(" ") && !value.endsWith(" ");
}
function useTypeahead({
  commands,
  onInputChange,
  onSubmit,
  setCursorOffset,
  input,
  cursorOffset,
  mode,
  agents,
  setSuggestionsState,
  suggestionsState: {
    suggestions,
    selectedSuggestion,
    commandArgumentHint
  },
  suppressSuggestions = false,
  markAccepted,
  onModeChange
}) {
  const {
    addNotification
  } = useNotifications();
  const thinkingToggleShortcut = useShortcutDisplay("chat:thinkingToggle", "Chat", "alt+t");
  const [suggestionType, setSuggestionType] = useState("none");
  const allCommandsMaxWidth = useMemo(() => {
    const visibleCommands = commands.filter((cmd) => !cmd.isHidden);
    if (visibleCommands.length === 0) return void 0;
    const maxLen = Math.max(...visibleCommands.map((cmd) => getCommandName(cmd).length));
    return maxLen + 6;
  }, [commands]);
  const [maxColumnWidth, setMaxColumnWidth] = useState(void 0);
  const mcpResources = useAppState((s) => s.mcp.resources);
  const store = useAppStateStore();
  const promptSuggestion = useAppState((s) => s.promptSuggestion);
  const isViewingTeammate = useAppState((s) => !!s.viewingAgentTaskId);
  const keybindingContext = useOptionalKeybindingContext();
  const [inlineGhostText, setInlineGhostText] = useState(void 0);
  const syncPromptGhostText = useMemo(() => {
    if (mode !== "prompt" || suppressSuggestions) return void 0;
    const midInputCommand = findMidInputSlashCommand(input, cursorOffset);
    if (!midInputCommand) return void 0;
    const match = getBestCommandMatch(midInputCommand.partialCommand, commands);
    if (!match) return void 0;
    return {
      text: match.suffix,
      fullCommand: match.fullCommand,
      insertPosition: midInputCommand.startPos + 1 + midInputCommand.partialCommand.length
    };
  }, [input, cursorOffset, mode, commands, suppressSuggestions]);
  const effectiveGhostText = suppressSuggestions ? void 0 : mode === "prompt" ? syncPromptGhostText : inlineGhostText;
  const cursorOffsetRef = useRef(cursorOffset);
  cursorOffsetRef.current = cursorOffset;
  const latestSearchTokenRef = useRef(null);
  const prevInputRef = useRef("");
  const latestPathTokenRef = useRef("");
  const latestBashInputRef = useRef("");
  const latestSlackTokenRef = useRef("");
  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;
  const dismissedForInputRef = useRef(null);
  const clearSuggestions = useCallback(() => {
    setSuggestionsState(() => ({
      commandArgumentHint: void 0,
      suggestions: [],
      selectedSuggestion: -1
    }));
    setSuggestionType("none");
    setMaxColumnWidth(void 0);
    setInlineGhostText(void 0);
  }, [setSuggestionsState]);
  const fetchFileSuggestions = useCallback(async (searchToken, isAtSymbol = false) => {
    latestSearchTokenRef.current = searchToken;
    const combinedItems = await generateUnifiedSuggestions(searchToken, mcpResources, agents, isAtSymbol);
    if (latestSearchTokenRef.current !== searchToken) {
      return;
    }
    if (combinedItems.length === 0) {
      setSuggestionsState(() => ({
        commandArgumentHint: void 0,
        suggestions: [],
        selectedSuggestion: -1
      }));
      setSuggestionType("none");
      setMaxColumnWidth(void 0);
      return;
    }
    setSuggestionsState((prev) => ({
      commandArgumentHint: void 0,
      suggestions: combinedItems,
      selectedSuggestion: getPreservedSelection(prev.suggestions, prev.selectedSuggestion, combinedItems)
    }));
    setSuggestionType(combinedItems.length > 0 ? "file" : "none");
    setMaxColumnWidth(void 0);
  }, [mcpResources, setSuggestionsState, setSuggestionType, setMaxColumnWidth, agents]);
  useEffect(() => {
    if (!isTuiSmokeTestMode() && !isBareMode()) {
      startBackgroundCacheRefresh();
    }
    return onIndexBuildComplete(() => {
      const token = latestSearchTokenRef.current;
      if (token !== null) {
        latestSearchTokenRef.current = null;
        void fetchFileSuggestions(token, token === "");
      }
    });
  }, [fetchFileSuggestions]);
  const debouncedFetchFileSuggestions = useDebounceCallback(fetchFileSuggestions, 50);
  const fetchSlackChannels = useCallback(
    async (partial) => {
      latestSlackTokenRef.current = partial;
      const channels = await getSlackChannelSuggestions(store.getState().mcp.clients, partial);
      if (latestSlackTokenRef.current !== partial) return;
      setSuggestionsState((prev) => ({
        commandArgumentHint: void 0,
        suggestions: channels,
        selectedSuggestion: getPreservedSelection(prev.suggestions, prev.selectedSuggestion, channels)
      }));
      setSuggestionType(channels.length > 0 ? "slack-channel" : "none");
      setMaxColumnWidth(void 0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store is a stable context ref
    [setSuggestionsState]
  );
  const debouncedFetchSlackChannels = useDebounceCallback(fetchSlackChannels, 150);
  const updateSuggestions = useCallback(async (value, inputCursorOffset) => {
    const effectiveCursorOffset = inputCursorOffset ?? cursorOffsetRef.current;
    if (suppressSuggestions) {
      debouncedFetchFileSuggestions.cancel();
      clearSuggestions();
      return;
    }
    if (mode === "prompt") {
      const midInputCommand = findMidInputSlashCommand(value, effectiveCursorOffset);
      if (midInputCommand) {
        const match = getBestCommandMatch(midInputCommand.partialCommand, commands);
        if (match) {
          setSuggestionsState(() => ({
            commandArgumentHint: void 0,
            suggestions: [],
            selectedSuggestion: -1
          }));
          setSuggestionType("none");
          setMaxColumnWidth(void 0);
          return;
        }
      }
    }
    if (mode === "bash" && value.trim()) {
      latestBashInputRef.current = value;
      const historyMatch = await getShellHistoryCompletion(value);
      if (latestBashInputRef.current !== value) {
        return;
      }
      if (historyMatch) {
        setInlineGhostText({
          text: historyMatch.suffix,
          fullCommand: historyMatch.fullCommand,
          insertPosition: value.length
        });
        setSuggestionsState(() => ({
          commandArgumentHint: void 0,
          suggestions: [],
          selectedSuggestion: -1
        }));
        setSuggestionType("none");
        setMaxColumnWidth(void 0);
        return;
      } else {
        setInlineGhostText(void 0);
      }
    }
    const atMatch = mode !== "bash" ? value.substring(0, effectiveCursorOffset).match(/(^|\s)@([\w-]*)$/) : null;
    if (atMatch) {
      const partialName = (atMatch[2] ?? "").toLowerCase();
      const state = store.getState();
      const members = [];
      const seen = /* @__PURE__ */ new Set();
      if (isAgentSwarmsEnabled() && state.teamContext) {
        for (const t of Object.values(state.teamContext.teammates ?? {})) {
          if (t.name === TEAM_LEAD_NAME) continue;
          if (!t.name.toLowerCase().startsWith(partialName)) continue;
          seen.add(t.name);
          members.push({
            id: `dm-${t.name}`,
            displayText: `@${t.name}`,
            description: "send message"
          });
        }
      }
      for (const [name, agentId] of state.agentNameRegistry) {
        if (seen.has(name)) continue;
        if (!name.toLowerCase().startsWith(partialName)) continue;
        const status = state.tasks[agentId]?.status;
        members.push({
          id: `dm-${name}`,
          displayText: `@${name}`,
          description: status ? `send message \xB7 ${status}` : "send message"
        });
      }
      if (members.length > 0) {
        debouncedFetchFileSuggestions.cancel();
        setSuggestionsState((prev) => ({
          commandArgumentHint: void 0,
          suggestions: members,
          selectedSuggestion: getPreservedSelection(prev.suggestions, prev.selectedSuggestion, members)
        }));
        setSuggestionType("agent");
        setMaxColumnWidth(void 0);
        return;
      }
    }
    if (mode === "prompt") {
      const hashMatch = value.substring(0, effectiveCursorOffset).match(HASH_CHANNEL_RE);
      if (hashMatch && hasSlackMcpServer(store.getState().mcp.clients)) {
        debouncedFetchSlackChannels(hashMatch[2]);
        return;
      } else if (suggestionType === "slack-channel") {
        debouncedFetchSlackChannels.cancel();
        clearSuggestions();
      }
    }
    const hasAtSymbol = value.substring(0, effectiveCursorOffset).match(HAS_AT_SYMBOL_RE);
    const isAtEndWithWhitespace = effectiveCursorOffset === value.length && effectiveCursorOffset > 0 && value.length > 0 && value[effectiveCursorOffset - 1] === " ";
    if (mode === "prompt" && isCommandInput(value) && effectiveCursorOffset > 0) {
      const parsedCommand = extractCommandNameAndArgs(value);
      if (parsedCommand && parsedCommand.commandName === "add-dir" && parsedCommand.args) {
        const {
          args
        } = parsedCommand;
        if (args.match(/\s+$/)) {
          debouncedFetchFileSuggestions.cancel();
          clearSuggestions();
          return;
        }
        const dirSuggestions = await getDirectoryCompletions(args);
        if (dirSuggestions.length > 0) {
          setSuggestionsState((prev) => ({
            suggestions: dirSuggestions,
            selectedSuggestion: getPreservedSelection(prev.suggestions, prev.selectedSuggestion, dirSuggestions),
            commandArgumentHint: void 0
          }));
          setSuggestionType("directory");
          return;
        }
        debouncedFetchFileSuggestions.cancel();
        clearSuggestions();
        return;
      }
      if (parsedCommand && parsedCommand.commandName === "resume" && parsedCommand.args !== void 0 && value.includes(" ")) {
        const {
          args
        } = parsedCommand;
        const matches = await searchSessionsByCustomTitle(args, {
          limit: 10
        });
        const suggestions2 = matches.map((log) => {
          const sessionId = getSessionIdFromLog(log);
          return {
            id: `resume-title-${sessionId}`,
            displayText: log.customTitle,
            description: formatLogMetadata(log),
            metadata: {
              sessionId
            }
          };
        });
        if (suggestions2.length > 0) {
          setSuggestionsState((prev) => ({
            suggestions: suggestions2,
            selectedSuggestion: getPreservedSelection(prev.suggestions, prev.selectedSuggestion, suggestions2),
            commandArgumentHint: void 0
          }));
          setSuggestionType("custom-title");
          return;
        }
        clearSuggestions();
        return;
      }
    }
    if (mode === "prompt" && isCommandInput(value) && effectiveCursorOffset > 0 && !hasCommandWithArguments(isAtEndWithWhitespace, value)) {
      let commandArgumentHint2 = void 0;
      if (value.length > 1) {
        const spaceIndex = value.indexOf(" ");
        const commandName = spaceIndex === -1 ? value.slice(1) : value.slice(1, spaceIndex);
        const hasRealArguments = spaceIndex !== -1 && value.slice(spaceIndex + 1).trim().length > 0;
        const hasExactlyOneTrailingSpace = spaceIndex !== -1 && value.length === spaceIndex + 1;
        if (spaceIndex !== -1) {
          const exactMatch = commands.find((cmd) => getCommandName(cmd) === commandName);
          if (exactMatch || hasRealArguments) {
            if (exactMatch?.argumentHint && hasExactlyOneTrailingSpace) {
              commandArgumentHint2 = exactMatch.argumentHint;
            } else if (exactMatch?.type === "prompt" && exactMatch.argNames?.length && value.endsWith(" ")) {
              const argsText = value.slice(spaceIndex + 1);
              const typedArgs = parseArguments(argsText);
              commandArgumentHint2 = generateProgressiveArgumentHint(exactMatch.argNames, typedArgs);
            }
            setSuggestionsState(() => ({
              commandArgumentHint: commandArgumentHint2,
              suggestions: [],
              selectedSuggestion: -1
            }));
            setSuggestionType("none");
            setMaxColumnWidth(void 0);
            return;
          }
        }
      }
      const commandItems = generateCommandSuggestions(value, commands);
      setSuggestionsState(() => ({
        commandArgumentHint: commandArgumentHint2,
        suggestions: commandItems,
        selectedSuggestion: commandItems.length > 0 ? 0 : -1
      }));
      setSuggestionType(commandItems.length > 0 ? "command" : "none");
      if (commandItems.length > 0) {
        setMaxColumnWidth(allCommandsMaxWidth);
      }
      return;
    }
    if (suggestionType === "command") {
      debouncedFetchFileSuggestions.cancel();
      clearSuggestions();
    } else if (isCommandInput(value) && hasCommandWithArguments(isAtEndWithWhitespace, value)) {
      setSuggestionsState((prev) => prev.commandArgumentHint ? {
        ...prev,
        commandArgumentHint: void 0
      } : prev);
    }
    if (suggestionType === "custom-title") {
      clearSuggestions();
    }
    if (suggestionType === "agent" && suggestionsRef.current.some((s) => s.id?.startsWith("dm-"))) {
      const hasAt = value.substring(0, effectiveCursorOffset).match(/(^|\s)@([\w-]*)$/);
      if (!hasAt) {
        clearSuggestions();
      }
    }
    if (hasAtSymbol && mode !== "bash") {
      const completionToken = extractCompletionToken(value, effectiveCursorOffset, true);
      if (completionToken && completionToken.token.startsWith("@")) {
        const searchToken = extractSearchToken(completionToken);
        if (isPathLikeToken(searchToken)) {
          latestPathTokenRef.current = searchToken;
          const pathSuggestions = await getPathCompletions(searchToken, {
            maxResults: 10
          });
          if (latestPathTokenRef.current !== searchToken) {
            return;
          }
          if (pathSuggestions.length > 0) {
            setSuggestionsState((prev) => ({
              suggestions: pathSuggestions,
              selectedSuggestion: getPreservedSelection(prev.suggestions, prev.selectedSuggestion, pathSuggestions),
              commandArgumentHint: void 0
            }));
            setSuggestionType("directory");
            return;
          }
        }
        if (latestSearchTokenRef.current === searchToken) {
          return;
        }
        void debouncedFetchFileSuggestions(searchToken, true);
        return;
      }
    }
    if (suggestionType === "file") {
      const completionToken = extractCompletionToken(value, effectiveCursorOffset, true);
      if (completionToken) {
        const searchToken = extractSearchToken(completionToken);
        if (latestSearchTokenRef.current === searchToken) {
          return;
        }
        void debouncedFetchFileSuggestions(searchToken, false);
      } else {
        debouncedFetchFileSuggestions.cancel();
        clearSuggestions();
      }
    }
    if (suggestionType === "shell") {
      const inputSnapshot = suggestionsRef.current[0]?.metadata?.inputSnapshot;
      if (mode !== "bash" || value !== inputSnapshot) {
        debouncedFetchFileSuggestions.cancel();
        clearSuggestions();
      }
    }
  }, [
    suggestionType,
    commands,
    setSuggestionsState,
    clearSuggestions,
    debouncedFetchFileSuggestions,
    debouncedFetchSlackChannels,
    mode,
    suppressSuggestions,
    // Note: using suggestionsRef instead of suggestions to avoid recreating
    // this callback when only selectedSuggestion changes (not the suggestions list)
    allCommandsMaxWidth
  ]);
  useEffect(() => {
    if (dismissedForInputRef.current === input) {
      return;
    }
    if (prevInputRef.current !== input) {
      prevInputRef.current = input;
      latestSearchTokenRef.current = null;
    }
    dismissedForInputRef.current = null;
    void updateSuggestions(input);
  }, [input, updateSuggestions]);
  const handleTab = useCallback(async () => {
    if (effectiveGhostText) {
      if (mode === "bash") {
        onInputChange(effectiveGhostText.fullCommand);
        setCursorOffset(effectiveGhostText.fullCommand.length);
        setInlineGhostText(void 0);
        return;
      }
      const midInputCommand = findMidInputSlashCommand(input, cursorOffset);
      if (midInputCommand) {
        const before = input.slice(0, midInputCommand.startPos);
        const after = input.slice(midInputCommand.startPos + midInputCommand.token.length);
        const newInput = before + "/" + effectiveGhostText.fullCommand + " " + after;
        const newCursorOffset = midInputCommand.startPos + 1 + effectiveGhostText.fullCommand.length + 1;
        onInputChange(newInput);
        setCursorOffset(newCursorOffset);
        return;
      }
    }
    if (suggestions.length > 0) {
      debouncedFetchFileSuggestions.cancel();
      debouncedFetchSlackChannels.cancel();
      const index = selectedSuggestion === -1 ? 0 : selectedSuggestion;
      const suggestion = suggestions[index];
      if (suggestionType === "command" && index < suggestions.length) {
        if (suggestion) {
          applyCommandSuggestion(
            suggestion,
            false,
            // don't execute on tab
            commands,
            onInputChange,
            setCursorOffset,
            onSubmit
          );
          clearSuggestions();
        }
      } else if (suggestionType === "custom-title" && suggestions.length > 0) {
        if (suggestion) {
          const newInput = buildResumeInputFromSuggestion(suggestion);
          onInputChange(newInput);
          setCursorOffset(newInput.length);
          clearSuggestions();
        }
      } else if (suggestionType === "directory" && suggestions.length > 0) {
        const suggestion2 = suggestions[index];
        if (suggestion2) {
          const isInCommandContext = isCommandInput(input);
          let newInput;
          if (isInCommandContext) {
            const spaceIndex = input.indexOf(" ");
            const commandPart = input.slice(0, spaceIndex + 1);
            const cmdSuffix = isPathMetadata(suggestion2.metadata) && suggestion2.metadata.type === "directory" ? "/" : " ";
            newInput = commandPart + suggestion2.id + cmdSuffix;
            onInputChange(newInput);
            setCursorOffset(newInput.length);
            if (isPathMetadata(suggestion2.metadata) && suggestion2.metadata.type === "directory") {
              setSuggestionsState((prev) => ({
                ...prev,
                commandArgumentHint: void 0
              }));
              void updateSuggestions(newInput, newInput.length);
            } else {
              clearSuggestions();
            }
          } else {
            const completionTokenWithAt = extractCompletionToken(input, cursorOffset, true);
            const completionToken = completionTokenWithAt ?? extractCompletionToken(input, cursorOffset, false);
            if (completionToken) {
              const isDir = isPathMetadata(suggestion2.metadata) && suggestion2.metadata.type === "directory";
              const result = applyDirectorySuggestion(input, suggestion2.id, completionToken.startPos, completionToken.token.length, isDir);
              newInput = result.newInput;
              onInputChange(newInput);
              setCursorOffset(result.cursorPos);
              if (isDir) {
                setSuggestionsState((prev) => ({
                  ...prev,
                  commandArgumentHint: void 0
                }));
                void updateSuggestions(newInput, result.cursorPos);
              } else {
                clearSuggestions();
              }
            } else {
              clearSuggestions();
            }
          }
        }
      } else if (suggestionType === "shell" && suggestions.length > 0) {
        const suggestion2 = suggestions[index];
        if (suggestion2) {
          const metadata = suggestion2.metadata;
          applyShellSuggestion(suggestion2, input, cursorOffset, onInputChange, setCursorOffset, metadata?.completionType);
          clearSuggestions();
        }
      } else if (suggestionType === "agent" && suggestions.length > 0 && suggestions[index]?.id?.startsWith("dm-")) {
        const suggestion2 = suggestions[index];
        if (suggestion2) {
          applyTriggerSuggestion(suggestion2, input, cursorOffset, DM_MEMBER_RE, onInputChange, setCursorOffset);
          clearSuggestions();
        }
      } else if (suggestionType === "slack-channel" && suggestions.length > 0) {
        const suggestion2 = suggestions[index];
        if (suggestion2) {
          applyTriggerSuggestion(suggestion2, input, cursorOffset, HASH_CHANNEL_RE, onInputChange, setCursorOffset);
          clearSuggestions();
        }
      } else if (suggestionType === "file" && suggestions.length > 0) {
        const completionToken = extractCompletionToken(input, cursorOffset, true);
        if (!completionToken) {
          clearSuggestions();
          return;
        }
        const commonPrefix = findLongestCommonPrefix(suggestions);
        const hasAtPrefix = completionToken.token.startsWith("@");
        let effectiveTokenLength;
        if (completionToken.isQuoted) {
          effectiveTokenLength = completionToken.token.slice(2).replace(/"$/, "").length;
        } else if (hasAtPrefix) {
          effectiveTokenLength = completionToken.token.length - 1;
        } else {
          effectiveTokenLength = completionToken.token.length;
        }
        if (commonPrefix.length > effectiveTokenLength) {
          const replacementValue = formatReplacementValue({
            displayText: commonPrefix,
            mode,
            hasAtPrefix,
            needsQuotes: false,
            // common prefix doesn't need quotes unless already quoted
            isQuoted: completionToken.isQuoted,
            isComplete: false
            // partial completion
          });
          applyFileSuggestion(replacementValue, input, completionToken.token, completionToken.startPos, onInputChange, setCursorOffset);
          void updateSuggestions(input.replace(completionToken.token, replacementValue), cursorOffset);
        } else if (index < suggestions.length) {
          const suggestion2 = suggestions[index];
          if (suggestion2) {
            const needsQuotes = suggestion2.displayText.includes(" ");
            const replacementValue = formatReplacementValue({
              displayText: suggestion2.displayText,
              mode,
              hasAtPrefix,
              needsQuotes,
              isQuoted: completionToken.isQuoted,
              isComplete: true
              // complete suggestion
            });
            applyFileSuggestion(replacementValue, input, completionToken.token, completionToken.startPos, onInputChange, setCursorOffset);
            clearSuggestions();
          }
        }
      }
    } else if (input.trim() !== "") {
      let suggestionType2;
      let suggestionItems;
      if (mode === "bash") {
        suggestionType2 = "shell";
        const bashSuggestions = await generateBashSuggestions(input, cursorOffset);
        if (bashSuggestions.length === 1) {
          const suggestion = bashSuggestions[0];
          if (suggestion) {
            const metadata = suggestion.metadata;
            applyShellSuggestion(suggestion, input, cursorOffset, onInputChange, setCursorOffset, metadata?.completionType);
          }
          suggestionItems = [];
        } else {
          suggestionItems = bashSuggestions;
        }
      } else {
        suggestionType2 = "file";
        const completionInfo = extractCompletionToken(input, cursorOffset, true);
        if (completionInfo) {
          const isAtSymbol = completionInfo.token.startsWith("@");
          const searchToken = isAtSymbol ? completionInfo.token.substring(1) : completionInfo.token;
          suggestionItems = await generateUnifiedSuggestions(searchToken, mcpResources, agents, isAtSymbol);
        } else {
          suggestionItems = [];
        }
      }
      if (suggestionItems.length > 0) {
        setSuggestionsState((prev) => ({
          commandArgumentHint: void 0,
          suggestions: suggestionItems,
          selectedSuggestion: getPreservedSelection(prev.suggestions, prev.selectedSuggestion, suggestionItems)
        }));
        setSuggestionType(suggestionType2);
        setMaxColumnWidth(void 0);
      }
    }
  }, [suggestions, selectedSuggestion, input, suggestionType, commands, mode, onInputChange, setCursorOffset, onSubmit, clearSuggestions, cursorOffset, updateSuggestions, mcpResources, setSuggestionsState, agents, debouncedFetchFileSuggestions, debouncedFetchSlackChannels, effectiveGhostText]);
  const handleEnter = useCallback(() => {
    if (selectedSuggestion < 0 || suggestions.length === 0) return;
    const suggestion = suggestions[selectedSuggestion];
    if (suggestionType === "command" && selectedSuggestion < suggestions.length) {
      if (suggestion) {
        applyCommandSuggestion(
          suggestion,
          true,
          // execute on return
          commands,
          onInputChange,
          setCursorOffset,
          onSubmit
        );
        debouncedFetchFileSuggestions.cancel();
        clearSuggestions();
      }
    } else if (suggestionType === "custom-title" && selectedSuggestion < suggestions.length) {
      if (suggestion) {
        const newInput = buildResumeInputFromSuggestion(suggestion);
        onInputChange(newInput);
        setCursorOffset(newInput.length);
        onSubmit(
          newInput,
          /* isSubmittingSlashCommand */
          true
        );
        debouncedFetchFileSuggestions.cancel();
        clearSuggestions();
      }
    } else if (suggestionType === "shell" && selectedSuggestion < suggestions.length) {
      const suggestion2 = suggestions[selectedSuggestion];
      if (suggestion2) {
        const metadata = suggestion2.metadata;
        applyShellSuggestion(suggestion2, input, cursorOffset, onInputChange, setCursorOffset, metadata?.completionType);
        debouncedFetchFileSuggestions.cancel();
        clearSuggestions();
      }
    } else if (suggestionType === "agent" && selectedSuggestion < suggestions.length && suggestion?.id?.startsWith("dm-")) {
      applyTriggerSuggestion(suggestion, input, cursorOffset, DM_MEMBER_RE, onInputChange, setCursorOffset);
      debouncedFetchFileSuggestions.cancel();
      clearSuggestions();
    } else if (suggestionType === "slack-channel" && selectedSuggestion < suggestions.length) {
      if (suggestion) {
        applyTriggerSuggestion(suggestion, input, cursorOffset, HASH_CHANNEL_RE, onInputChange, setCursorOffset);
        debouncedFetchSlackChannels.cancel();
        clearSuggestions();
      }
    } else if (suggestionType === "file" && selectedSuggestion < suggestions.length) {
      const completionInfo = extractCompletionToken(input, cursorOffset, true);
      if (completionInfo) {
        if (suggestion) {
          const hasAtPrefix = completionInfo.token.startsWith("@");
          const needsQuotes = suggestion.displayText.includes(" ");
          const replacementValue = formatReplacementValue({
            displayText: suggestion.displayText,
            mode,
            hasAtPrefix,
            needsQuotes,
            isQuoted: completionInfo.isQuoted,
            isComplete: true
            // complete suggestion
          });
          applyFileSuggestion(replacementValue, input, completionInfo.token, completionInfo.startPos, onInputChange, setCursorOffset);
          debouncedFetchFileSuggestions.cancel();
          clearSuggestions();
        }
      }
    } else if (suggestionType === "directory" && selectedSuggestion < suggestions.length) {
      if (suggestion) {
        if (isCommandInput(input)) {
          debouncedFetchFileSuggestions.cancel();
          clearSuggestions();
          return;
        }
        const completionTokenWithAt = extractCompletionToken(input, cursorOffset, true);
        const completionToken = completionTokenWithAt ?? extractCompletionToken(input, cursorOffset, false);
        if (completionToken) {
          const isDir = isPathMetadata(suggestion.metadata) && suggestion.metadata.type === "directory";
          const result = applyDirectorySuggestion(input, suggestion.id, completionToken.startPos, completionToken.token.length, isDir);
          onInputChange(result.newInput);
          setCursorOffset(result.cursorPos);
        }
        debouncedFetchFileSuggestions.cancel();
        clearSuggestions();
      }
    }
  }, [suggestions, selectedSuggestion, suggestionType, commands, input, cursorOffset, mode, onInputChange, setCursorOffset, onSubmit, clearSuggestions, debouncedFetchFileSuggestions, debouncedFetchSlackChannels]);
  const handleAutocompleteAccept = useCallback(() => {
    void handleTab();
  }, [handleTab]);
  const handleAutocompleteDismiss = useCallback(() => {
    debouncedFetchFileSuggestions.cancel();
    debouncedFetchSlackChannels.cancel();
    clearSuggestions();
    dismissedForInputRef.current = input;
  }, [debouncedFetchFileSuggestions, debouncedFetchSlackChannels, clearSuggestions, input]);
  const handleAutocompletePrevious = useCallback(() => {
    setSuggestionsState((prev) => ({
      ...prev,
      selectedSuggestion: prev.selectedSuggestion <= 0 ? suggestions.length - 1 : prev.selectedSuggestion - 1
    }));
  }, [suggestions.length, setSuggestionsState]);
  const handleAutocompleteNext = useCallback(() => {
    setSuggestionsState((prev) => ({
      ...prev,
      selectedSuggestion: prev.selectedSuggestion >= suggestions.length - 1 ? 0 : prev.selectedSuggestion + 1
    }));
  }, [suggestions.length, setSuggestionsState]);
  const autocompleteHandlers = useMemo(() => ({
    "autocomplete:accept": handleAutocompleteAccept,
    "autocomplete:dismiss": handleAutocompleteDismiss,
    "autocomplete:previous": handleAutocompletePrevious,
    "autocomplete:next": handleAutocompleteNext
  }), [handleAutocompleteAccept, handleAutocompleteDismiss, handleAutocompletePrevious, handleAutocompleteNext]);
  const isAutocompleteActive = suggestions.length > 0 || !!effectiveGhostText;
  const isModalOverlayActive = useIsModalOverlayActive();
  useRegisterOverlay("autocomplete", isAutocompleteActive);
  useRegisterKeybindingContext("Autocomplete", isAutocompleteActive);
  useKeybindings(autocompleteHandlers, {
    context: "Autocomplete",
    isActive: isAutocompleteActive && !isModalOverlayActive
  });
  function acceptSuggestionText(text) {
    const detectedMode = getModeFromInput(text);
    if (detectedMode !== "prompt" && onModeChange) {
      onModeChange(detectedMode);
      const stripped = getValueFromInput(text);
      onInputChange(stripped);
      setCursorOffset(stripped.length);
    } else {
      onInputChange(text);
      setCursorOffset(text.length);
    }
  }
  const handleKeyDown = (e) => {
    if (e.key === "right" && !isViewingTeammate) {
      const suggestionText = promptSuggestion.text;
      const suggestionShownAt = promptSuggestion.shownAt;
      if (suggestionText && suggestionShownAt > 0 && input === "") {
        markAccepted();
        acceptSuggestionText(suggestionText);
        e.stopImmediatePropagation();
        return;
      }
    }
    if (e.key === "tab" && !e.shift) {
      if (suggestions.length > 0 || effectiveGhostText) {
        return;
      }
      const suggestionText = promptSuggestion.text;
      const suggestionShownAt = promptSuggestion.shownAt;
      if (suggestionText && suggestionShownAt > 0 && input === "" && !isViewingTeammate) {
        e.preventDefault();
        markAccepted();
        acceptSuggestionText(suggestionText);
        return;
      }
      if (input.trim() === "") {
        e.preventDefault();
        addNotification({
          key: "thinking-toggle-hint",
          jsx: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
            "Use ",
            thinkingToggleShortcut,
            " to toggle thinking"
          ] }),
          priority: "immediate",
          timeoutMs: 3e3
        });
      }
      return;
    }
    if (suggestions.length === 0) return;
    const hasPendingChord = keybindingContext?.pendingChord != null;
    if (e.ctrl && e.key === "n" && !hasPendingChord) {
      e.preventDefault();
      handleAutocompleteNext();
      return;
    }
    if (e.ctrl && e.key === "p" && !hasPendingChord) {
      e.preventDefault();
      handleAutocompletePrevious();
      return;
    }
    if (e.key === "return" && !e.shift && !e.meta) {
      e.preventDefault();
      handleEnter();
    }
  };
  useInput((_input, _key, event) => {
    const kbEvent = new KeyboardEvent(event.keypress);
    handleKeyDown(kbEvent);
    if (kbEvent.didStopImmediatePropagation()) {
      event.stopImmediatePropagation();
    }
  });
  return {
    suggestions,
    selectedSuggestion,
    suggestionType,
    maxColumnWidth,
    commandArgumentHint,
    inlineGhostText: effectiveGhostText,
    handleKeyDown
  };
}
export {
  applyDirectorySuggestion,
  applyShellSuggestion,
  extractCompletionToken,
  extractSearchToken,
  formatReplacementValue,
  useTypeahead
};
