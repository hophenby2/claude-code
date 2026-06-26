const feature = (_name) => false;
import { randomUUID } from "crypto";
import { setPromptId } from "../../bootstrap/state.js";
import { builtInCommandNames, findCommand, getCommand, getCommandName, hasCommand } from "../../commands.js";
import { NO_CONTENT_MESSAGE } from "../../constants/messages.js";
import { addInvokedSkill, getSessionId } from "../../bootstrap/state.js";
import { COMMAND_MESSAGE_TAG, COMMAND_NAME_TAG } from "../../constants/xml.js";
import { logEvent } from "../../services/analytics/index.js";
import "../../services/api/dumpPrompts.js";
import { buildPostCompactMessages } from "../../services/compact/compact.js";
import { resetMicrocompactState } from "../../services/compact/microCompact.js";
import { runAgent } from "../../tools/AgentTool/runAgent.js";
import { renderToolUseProgressMessage } from "../../tools/AgentTool/UI.js";
import "../abortController.js";
import { getAgentContext } from "../agentContext.js";
import { createAttachmentMessage, getAttachmentMessages } from "../attachments.js";
import { logForDebugging } from "../debug.js";
import "../envUtils.js";
import { AbortError, MalformedCommandError } from "../errors.js";
import "../file.js";
import { extractResultText, prepareForkedCommandContext } from "../forkedAgent.js";
import { getFsImplementation } from "../fsOperations.js";
import { isFullscreenEnvEnabled } from "../fullscreen.js";
import { toArray } from "../generators.js";
import { registerSkillHooks } from "../hooks/registerSkillHooks.js";
import { logError } from "../log.js";
import "../messageQueueManager.js";
import { createCommandInputMessage, createSyntheticUserCaveatMessage, createSystemMessage, createUserInterruptionMessage, createUserMessage, formatCommandInputTags, isCompactBoundaryMessage, isSystemLocalCommandMessage, normalizeMessages, prepareUserContent } from "../messages.js";
import { parseToolListFromCLI } from "../permissions/permissionSetup.js";
import { hasPermissionsToUseTool } from "../permissions/permissions.js";
import { isOfficialMarketplaceName, parsePluginIdentifier } from "../plugins/pluginIdentifier.js";
import { isRestrictedToPluginOnly, isSourceAdminTrusted } from "../settings/pluginOnlyPolicy.js";
import { parseSlashCommand } from "../slashCommandParsing.js";
import "../sleep.js";
import { recordSkillUsage } from "../suggestions/skillUsageTracking.js";
import { logOTelEvent, redactIfDisabled } from "../telemetry/events.js";
import { buildPluginCommandTelemetryFields } from "../telemetry/pluginTelemetry.js";
import { getAssistantMessageContentLength } from "../tokens.js";
import { createAgentId } from "../uuid.js";
import "../workloadContext.js";
const MCP_SETTLE_POLL_MS = 200;
const MCP_SETTLE_TIMEOUT_MS = 1e4;
async function executeForkedSlashCommand(command, args, context, precedingInputBlocks, setToolJSX, canUseTool) {
  const agentId = createAgentId();
  const pluginMarketplace = command.pluginInfo ? parsePluginIdentifier(command.pluginInfo.repository).marketplace : void 0;
  logEvent("tengu_slash_command_forked", {
    command_name: command.name,
    invocation_trigger: "user-slash",
    ...command.pluginInfo && {
      _PROTO_plugin_name: command.pluginInfo.pluginManifest.name,
      ...pluginMarketplace && {
        _PROTO_marketplace_name: pluginMarketplace
      },
      ...buildPluginCommandTelemetryFields(command.pluginInfo)
    }
  });
  const {
    skillContent,
    modifiedGetAppState,
    baseAgent,
    promptMessages
  } = await prepareForkedCommandContext(command, args, context);
  const agentDefinition = command.effort !== void 0 ? {
    ...baseAgent,
    effort: command.effort
  } : baseAgent;
  logForDebugging(`Executing forked slash command /${command.name} with agent ${agentDefinition.agentType}`);
  if (false) {
    const bgAbortController = createAbortController();
    const commandName = getCommandName(command);
    const spawnTimeWorkload = getWorkload();
    const enqueueResult = (value) => enqueuePendingNotification({
      value,
      mode: "prompt",
      priority: "later",
      isMeta: true,
      skipSlashCommands: true,
      workload: spawnTimeWorkload
    });
    void (async () => {
      const deadline = Date.now() + MCP_SETTLE_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const s = context.getAppState();
        if (!s.mcp.clients.some((c) => c.type === "pending")) break;
        await sleep(MCP_SETTLE_POLL_MS);
      }
      const freshTools = context.options.refreshTools?.() ?? context.options.tools;
      const agentMessages2 = [];
      for await (const message of runAgent({
        agentDefinition,
        promptMessages,
        toolUseContext: {
          ...context,
          getAppState: modifiedGetAppState,
          abortController: bgAbortController
        },
        canUseTool,
        isAsync: true,
        querySource: "agent:custom",
        model: command.model,
        availableTools: freshTools,
        override: {
          agentId
        }
      })) {
        agentMessages2.push(message);
      }
      const resultText2 = extractResultText(agentMessages2, "Command completed");
      logForDebugging(`Background forked command /${commandName} completed (agent ${agentId})`);
      enqueueResult(`<scheduled-task-result command="/${commandName}">
${resultText2}
</scheduled-task-result>`);
    })().catch((err) => {
      logError(err);
      enqueueResult(`<scheduled-task-result command="/${commandName}" status="failed">
${err instanceof Error ? err.message : String(err)}
</scheduled-task-result>`);
    });
    return {
      messages: [],
      shouldQuery: false,
      command
    };
  }
  const agentMessages = [];
  const progressMessages = [];
  const parentToolUseID = `forked-command-${command.name}`;
  let toolUseCounter = 0;
  const createProgressMessage = (message) => {
    toolUseCounter++;
    return {
      type: "progress",
      data: {
        message,
        type: "agent_progress",
        prompt: skillContent,
        agentId
      },
      parentToolUseID,
      toolUseID: `${parentToolUseID}-${toolUseCounter}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      uuid: randomUUID()
    };
  };
  const updateProgress = () => {
    setToolJSX({
      jsx: renderToolUseProgressMessage(progressMessages, {
        tools: context.options.tools,
        verbose: false
      }),
      shouldHidePromptInput: false,
      shouldContinueAnimation: true,
      showSpinner: true
    });
  };
  updateProgress();
  try {
    for await (const message of runAgent({
      agentDefinition,
      promptMessages,
      toolUseContext: {
        ...context,
        getAppState: modifiedGetAppState
      },
      canUseTool,
      isAsync: false,
      querySource: "agent:custom",
      model: command.model,
      availableTools: context.options.tools
    })) {
      agentMessages.push(message);
      const normalizedNew = normalizeMessages([message]);
      if (message.type === "assistant") {
        const contentLength = getAssistantMessageContentLength(message);
        if (contentLength > 0) {
          context.setResponseLength((len) => len + contentLength);
        }
        const normalizedMsg = normalizedNew[0];
        if (normalizedMsg && normalizedMsg.type === "assistant") {
          progressMessages.push(createProgressMessage(message));
          updateProgress();
        }
      }
      if (message.type === "user") {
        const normalizedMsg = normalizedNew[0];
        if (normalizedMsg && normalizedMsg.type === "user") {
          progressMessages.push(createProgressMessage(normalizedMsg));
          updateProgress();
        }
      }
    }
  } finally {
    setToolJSX(null);
  }
  let resultText = extractResultText(agentMessages, "Command completed");
  logForDebugging(`Forked slash command /${command.name} completed with agent ${agentId}`);
  if (false) {
    resultText = `[ANT-ONLY] API calls: ${getDisplayPath(getDumpPromptsPath(agentId))}
${resultText}`;
  }
  const messages = [createUserMessage({
    content: prepareUserContent({
      inputString: `/${getCommandName(command)} ${args}`.trim(),
      precedingInputBlocks
    })
  }), createUserMessage({
    content: `<local-command-stdout>
${resultText}
</local-command-stdout>`
  })];
  return {
    messages,
    shouldQuery: false,
    command,
    resultText
  };
}
function looksLikeCommand(commandName) {
  return !/[^a-zA-Z0-9:\-_]/.test(commandName);
}
async function processSlashCommand(inputString, precedingInputBlocks, imageContentBlocks, attachmentMessages, context, setToolJSX, uuid, isAlreadyProcessing, canUseTool) {
  const parsed = parseSlashCommand(inputString);
  if (!parsed) {
    logEvent("tengu_input_slash_missing", {});
    const errorMessage = "Commands are in the form `/command [args]`";
    return {
      messages: [createSyntheticUserCaveatMessage(), ...attachmentMessages, createUserMessage({
        content: prepareUserContent({
          inputString: errorMessage,
          precedingInputBlocks
        })
      })],
      shouldQuery: false,
      resultText: errorMessage
    };
  }
  const {
    commandName,
    args: parsedArgs,
    isMcp
  } = parsed;
  const sanitizedCommandName = isMcp ? "mcp" : !builtInCommandNames().has(commandName) ? "custom" : commandName;
  if (!hasCommand(commandName, context.options.commands)) {
    let isFilePath = false;
    try {
      await getFsImplementation().stat(`/${commandName}`);
      isFilePath = true;
    } catch {
    }
    if (looksLikeCommand(commandName) && !isFilePath) {
      logEvent("tengu_input_slash_invalid", {
        input: commandName
      });
      const unknownMessage = `Unknown skill: ${commandName}`;
      return {
        messages: [
          createSyntheticUserCaveatMessage(),
          ...attachmentMessages,
          createUserMessage({
            content: prepareUserContent({
              inputString: unknownMessage,
              precedingInputBlocks
            })
          }),
          // gh-32591: preserve args so the user can copy/resubmit without
          // retyping. System warning is UI-only (filtered before API).
          ...parsedArgs ? [createSystemMessage(`Args from unknown skill: ${parsedArgs}`, "warning")] : []
        ],
        shouldQuery: false,
        resultText: unknownMessage
      };
    }
    const promptId = randomUUID();
    setPromptId(promptId);
    logEvent("tengu_input_prompt", {});
    void logOTelEvent("user_prompt", {
      prompt_length: String(inputString.length),
      prompt: redactIfDisabled(inputString),
      "prompt.id": promptId
    });
    return {
      messages: [createUserMessage({
        content: prepareUserContent({
          inputString,
          precedingInputBlocks
        }),
        uuid
      }), ...attachmentMessages],
      shouldQuery: true
    };
  }
  const {
    messages: newMessages,
    shouldQuery: messageShouldQuery,
    allowedTools,
    model,
    effort,
    command: returnedCommand,
    resultText,
    nextInput,
    submitNextInput
  } = await getMessagesForSlashCommand(commandName, parsedArgs, setToolJSX, context, precedingInputBlocks, imageContentBlocks, isAlreadyProcessing, canUseTool, uuid);
  if (newMessages.length === 0) {
    const eventData2 = {
      input: sanitizedCommandName
    };
    if (returnedCommand.type === "prompt" && returnedCommand.pluginInfo) {
      const {
        pluginManifest,
        repository
      } = returnedCommand.pluginInfo;
      const {
        marketplace
      } = parsePluginIdentifier(repository);
      const isOfficial = isOfficialMarketplaceName(marketplace);
      eventData2._PROTO_plugin_name = pluginManifest.name;
      if (marketplace) {
        eventData2._PROTO_marketplace_name = marketplace;
      }
      eventData2.plugin_repository = isOfficial ? repository : "third-party";
      eventData2.plugin_name = isOfficial ? pluginManifest.name : "third-party";
      if (isOfficial && pluginManifest.version) {
        eventData2.plugin_version = pluginManifest.version;
      }
      Object.assign(eventData2, buildPluginCommandTelemetryFields(returnedCommand.pluginInfo));
    }
    logEvent("tengu_input_command", {
      ...eventData2,
      invocation_trigger: "user-slash",
      ...false
    });
    return {
      messages: [],
      shouldQuery: false,
      model,
      nextInput,
      submitNextInput
    };
  }
  if (newMessages.length === 2 && newMessages[1].type === "user" && typeof newMessages[1].message.content === "string" && newMessages[1].message.content.startsWith("Unknown command:")) {
    const looksLikeFilePath = inputString.startsWith("/var") || inputString.startsWith("/tmp") || inputString.startsWith("/private");
    if (!looksLikeFilePath) {
      logEvent("tengu_input_slash_invalid", {
        input: commandName
      });
    }
    return {
      messages: [createSyntheticUserCaveatMessage(), ...newMessages],
      shouldQuery: messageShouldQuery,
      allowedTools,
      model
    };
  }
  const eventData = {
    input: sanitizedCommandName
  };
  if (returnedCommand.type === "prompt" && returnedCommand.pluginInfo) {
    const {
      pluginManifest,
      repository
    } = returnedCommand.pluginInfo;
    const {
      marketplace
    } = parsePluginIdentifier(repository);
    const isOfficial = isOfficialMarketplaceName(marketplace);
    eventData._PROTO_plugin_name = pluginManifest.name;
    if (marketplace) {
      eventData._PROTO_marketplace_name = marketplace;
    }
    eventData.plugin_repository = isOfficial ? repository : "third-party";
    eventData.plugin_name = isOfficial ? pluginManifest.name : "third-party";
    if (isOfficial && pluginManifest.version) {
      eventData.plugin_version = pluginManifest.version;
    }
    Object.assign(eventData, buildPluginCommandTelemetryFields(returnedCommand.pluginInfo));
  }
  logEvent("tengu_input_command", {
    ...eventData,
    invocation_trigger: "user-slash",
    ...false
  });
  const isCompactResult = newMessages.length > 0 && newMessages[0] && isCompactBoundaryMessage(newMessages[0]);
  return {
    messages: messageShouldQuery || newMessages.every(isSystemLocalCommandMessage) || isCompactResult ? newMessages : [createSyntheticUserCaveatMessage(), ...newMessages],
    shouldQuery: messageShouldQuery,
    allowedTools,
    model,
    effort,
    resultText,
    nextInput,
    submitNextInput
  };
}
async function getMessagesForSlashCommand(commandName, args, setToolJSX, context, precedingInputBlocks, imageContentBlocks, _isAlreadyProcessing, canUseTool, uuid) {
  const command = getCommand(commandName, context.options.commands);
  if (command.type === "prompt" && command.userInvocable !== false) {
    recordSkillUsage(commandName);
  }
  if (command.userInvocable === false) {
    return {
      messages: [createUserMessage({
        content: prepareUserContent({
          inputString: `/${commandName}`,
          precedingInputBlocks
        })
      }), createUserMessage({
        content: `This skill can only be invoked by Claude, not directly by users. Ask Claude to use the "${commandName}" skill for you.`
      })],
      shouldQuery: false,
      command
    };
  }
  try {
    switch (command.type) {
      case "local-jsx": {
        return new Promise((resolve) => {
          let doneWasCalled = false;
          const onDone = (result, options) => {
            doneWasCalled = true;
            if (options?.display === "skip") {
              void resolve({
                messages: [],
                shouldQuery: false,
                command,
                nextInput: options?.nextInput,
                submitNextInput: options?.submitNextInput
              });
              return;
            }
            const metaMessages = (options?.metaMessages ?? []).map((content) => createUserMessage({
              content,
              isMeta: true
            }));
            const skipTranscript = isFullscreenEnvEnabled() && typeof result === "string" && result.endsWith(" dismissed");
            void resolve({
              messages: options?.display === "system" ? skipTranscript ? metaMessages : [createCommandInputMessage(formatCommandInput(command, args)), createCommandInputMessage(`<local-command-stdout>${result}</local-command-stdout>`), ...metaMessages] : [createUserMessage({
                content: prepareUserContent({
                  inputString: formatCommandInput(command, args),
                  precedingInputBlocks
                })
              }), result ? createUserMessage({
                content: `<local-command-stdout>${result}</local-command-stdout>`
              }) : createUserMessage({
                content: `<local-command-stdout>${NO_CONTENT_MESSAGE}</local-command-stdout>`
              }), ...metaMessages],
              shouldQuery: options?.shouldQuery ?? false,
              command,
              nextInput: options?.nextInput,
              submitNextInput: options?.submitNextInput
            });
          };
          void command.load().then((mod) => mod.call(onDone, {
            ...context,
            canUseTool
          }, args)).then((jsx) => {
            if (jsx == null) return;
            if (context.options.isNonInteractiveSession) {
              void resolve({
                messages: [],
                shouldQuery: false,
                command
              });
              return;
            }
            if (doneWasCalled) return;
            setToolJSX({
              jsx,
              shouldHidePromptInput: true,
              showSpinner: false,
              isLocalJSXCommand: true,
              isImmediate: command.immediate === true
            });
          }).catch((e) => {
            logError(e);
            if (doneWasCalled) return;
            doneWasCalled = true;
            setToolJSX({
              jsx: null,
              shouldHidePromptInput: false,
              clearLocalJSX: true
            });
            void resolve({
              messages: [],
              shouldQuery: false,
              command
            });
          });
        });
      }
      case "local": {
        const displayArgs = command.isSensitive && args.trim() ? "***" : args;
        const userMessage = createUserMessage({
          content: prepareUserContent({
            inputString: formatCommandInput(command, displayArgs),
            precedingInputBlocks
          })
        });
        try {
          const syntheticCaveatMessage = createSyntheticUserCaveatMessage();
          const mod = await command.load();
          const result = await mod.call(args, context);
          if (result.type === "skip") {
            return {
              messages: [],
              shouldQuery: false,
              command
            };
          }
          if (result.type === "compact") {
            const slashCommandMessages = [syntheticCaveatMessage, userMessage, ...result.displayText ? [createUserMessage({
              content: `<local-command-stdout>${result.displayText}</local-command-stdout>`,
              // --resume looks at latest timestamp message to determine which message to resume from
              // This is a perf optimization to avoid having to recaculcate the leaf node every time
              // Since we're creating a bunch of synthetic messages for compact, it's important to set
              // the timestamp of the last message to be slightly after the current time
              // This is mostly important for sdk / -p mode
              timestamp: new Date(Date.now() + 100).toISOString()
            })] : []];
            const compactionResultWithSlashMessages = {
              ...result.compactionResult,
              messagesToKeep: [...result.compactionResult.messagesToKeep ?? [], ...slashCommandMessages]
            };
            resetMicrocompactState();
            return {
              messages: buildPostCompactMessages(compactionResultWithSlashMessages),
              shouldQuery: false,
              command
            };
          }
          return {
            messages: [userMessage, createCommandInputMessage(`<local-command-stdout>${result.value}</local-command-stdout>`)],
            shouldQuery: false,
            command,
            resultText: result.value
          };
        } catch (e) {
          logError(e);
          return {
            messages: [userMessage, createCommandInputMessage(`<local-command-stderr>${String(e)}</local-command-stderr>`)],
            shouldQuery: false,
            command
          };
        }
      }
      case "prompt": {
        try {
          if (command.context === "fork") {
            return await executeForkedSlashCommand(command, args, context, precedingInputBlocks, setToolJSX, canUseTool ?? hasPermissionsToUseTool);
          }
          return await getMessagesForPromptSlashCommand(command, args, context, precedingInputBlocks, imageContentBlocks, uuid);
        } catch (e) {
          if (e instanceof AbortError) {
            return {
              messages: [createUserMessage({
                content: prepareUserContent({
                  inputString: formatCommandInput(command, args),
                  precedingInputBlocks
                })
              }), createUserInterruptionMessage({
                toolUse: false
              })],
              shouldQuery: false,
              command
            };
          }
          return {
            messages: [createUserMessage({
              content: prepareUserContent({
                inputString: formatCommandInput(command, args),
                precedingInputBlocks
              })
            }), createUserMessage({
              content: `<local-command-stderr>${String(e)}</local-command-stderr>`
            })],
            shouldQuery: false,
            command
          };
        }
      }
    }
  } catch (e) {
    if (e instanceof MalformedCommandError) {
      return {
        messages: [createUserMessage({
          content: prepareUserContent({
            inputString: e.message,
            precedingInputBlocks
          })
        })],
        shouldQuery: false,
        command
      };
    }
    throw e;
  }
}
function formatCommandInput(command, args) {
  return formatCommandInputTags(getCommandName(command), args);
}
function formatSkillLoadingMetadata(skillName, _progressMessage = "loading") {
  return [`<${COMMAND_MESSAGE_TAG}>${skillName}</${COMMAND_MESSAGE_TAG}>`, `<${COMMAND_NAME_TAG}>${skillName}</${COMMAND_NAME_TAG}>`, `<skill-format>true</skill-format>`].join("\n");
}
function formatSlashCommandLoadingMetadata(commandName, args) {
  return [`<${COMMAND_MESSAGE_TAG}>${commandName}</${COMMAND_MESSAGE_TAG}>`, `<${COMMAND_NAME_TAG}>/${commandName}</${COMMAND_NAME_TAG}>`, args ? `<command-args>${args}</command-args>` : null].filter(Boolean).join("\n");
}
function formatCommandLoadingMetadata(command, args) {
  if (command.userInvocable !== false) {
    return formatSlashCommandLoadingMetadata(command.name, args);
  }
  if (command.loadedFrom === "skills" || command.loadedFrom === "plugin" || command.loadedFrom === "mcp") {
    return formatSkillLoadingMetadata(command.name, command.progressMessage);
  }
  return formatSlashCommandLoadingMetadata(command.name, args);
}
async function processPromptSlashCommand(commandName, args, commands, context, imageContentBlocks = []) {
  const command = findCommand(commandName, commands);
  if (!command) {
    throw new MalformedCommandError(`Unknown command: ${commandName}`);
  }
  if (command.type !== "prompt") {
    throw new Error(`Unexpected ${command.type} command. Expected 'prompt' command. Use /${commandName} directly in the main conversation.`);
  }
  return getMessagesForPromptSlashCommand(command, args, context, [], imageContentBlocks);
}
async function getMessagesForPromptSlashCommand(command, args, context, precedingInputBlocks = [], imageContentBlocks = [], uuid) {
  if (false) {
    const metadata2 = formatCommandLoadingMetadata(command, args);
    const parts = [`Skill "/${command.name}" is available for workers.`];
    if (command.description) {
      parts.push(`Description: ${command.description}`);
    }
    if (command.whenToUse) {
      parts.push(`When to use: ${command.whenToUse}`);
    }
    const skillAllowedTools = command.allowedTools ?? [];
    if (skillAllowedTools.length > 0) {
      parts.push(`This skill grants workers additional tool permissions: ${skillAllowedTools.join(", ")}`);
    }
    parts.push(`
Instruct a worker to use this skill by including "Use the /${command.name} skill" in your Agent prompt. The worker has access to the Skill tool and will receive the skill's content and permissions when it invokes it.`);
    const summaryContent = [{
      type: "text",
      text: parts.join("\n")
    }];
    return {
      messages: [createUserMessage({
        content: metadata2,
        uuid
      }), createUserMessage({
        content: summaryContent,
        isMeta: true
      })],
      shouldQuery: true,
      model: command.model,
      effort: command.effort,
      command
    };
  }
  const result = await command.getPromptForCommand(args, context);
  const hooksAllowedForThisSkill = !isRestrictedToPluginOnly("hooks") || isSourceAdminTrusted(command.source);
  if (command.hooks && hooksAllowedForThisSkill) {
    const sessionId = getSessionId();
    registerSkillHooks(context.setAppState, sessionId, command.hooks, command.name, command.type === "prompt" ? command.skillRoot : void 0);
  }
  const skillPath = command.source ? `${command.source}:${command.name}` : command.name;
  const skillContent = result.filter((b) => b.type === "text").map((b) => b.text).join("\n\n");
  addInvokedSkill(command.name, skillPath, skillContent, getAgentContext()?.agentId ?? null);
  const metadata = formatCommandLoadingMetadata(command, args);
  const additionalAllowedTools = parseToolListFromCLI(command.allowedTools ?? []);
  const mainMessageContent = imageContentBlocks.length > 0 || precedingInputBlocks.length > 0 ? [...imageContentBlocks, ...precedingInputBlocks, ...result] : result;
  const attachmentMessages = await toArray(getAttachmentMessages(
    result.filter((block) => block.type === "text").map((block) => block.text).join(" "),
    context,
    null,
    [],
    // queuedCommands - handled by query.ts for mid-turn attachments
    context.messages,
    "repl_main_thread",
    {
      skipSkillDiscovery: true
    }
  ));
  const messages = [createUserMessage({
    content: metadata,
    uuid
  }), createUserMessage({
    content: mainMessageContent,
    isMeta: true
  }), ...attachmentMessages, createAttachmentMessage({
    type: "command_permissions",
    allowedTools: additionalAllowedTools,
    model: command.model
  })];
  return {
    messages,
    shouldQuery: true,
    allowedTools: additionalAllowedTools,
    model: command.model,
    effort: command.effort,
    command
  };
}
export {
  formatSkillLoadingMetadata,
  looksLikeCommand,
  processPromptSlashCommand,
  processSlashCommand
};
