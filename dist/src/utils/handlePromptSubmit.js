import { logEvent } from "../services/analytics/index.js";
import { getCommandName, isCommandEnabled } from "../commands.js";
import { selectableUserMessagesFilter } from "../components/MessageSelector.js";
import { expandPastedTextRefs, parseReferences } from "../history.js";
import {
  isValidImagePaste
} from "../types/textInputTypes.js";
import { createAbortController } from "./abortController.js";
import { logForDebugging } from "./debug.js";
import { fileHistoryEnabled, fileHistoryMakeSnapshot } from "./fileHistory.js";
import { gracefulShutdownSync } from "./gracefulShutdown.js";
import { enqueue } from "./messageQueueManager.js";
import { resolveSkillModelOverride } from "./model/model.js";
import { processUserInput } from "./processUserInput/processUserInput.js";
import { queryCheckpoint, startQueryProfile } from "./queryProfiler.js";
import { runWithWorkload } from "./workloadContext.js";
function exit() {
  gracefulShutdownSync(0);
}
async function handlePromptSubmit(params) {
  const {
    helpers,
    queryGuard,
    isExternalLoading = false,
    commands,
    onInputChange,
    setPastedContents,
    setToolJSX,
    getToolUseContext,
    messages,
    mainLoopModel,
    ideSelection,
    setUserInputOnProcessing,
    setAbortController,
    onQuery,
    setAppState,
    onBeforeQuery,
    canUseTool,
    queuedCommands,
    uuid,
    skipSlashCommands
  } = params;
  const { setCursorOffset, clearBuffer, resetHistory } = helpers;
  if (queuedCommands?.length) {
    startQueryProfile();
    await executeUserInput({
      queuedCommands,
      messages,
      mainLoopModel,
      ideSelection,
      querySource: params.querySource,
      commands,
      queryGuard,
      setToolJSX,
      getToolUseContext,
      setUserInputOnProcessing,
      setAbortController,
      onQuery,
      setAppState,
      onBeforeQuery,
      resetHistory,
      canUseTool,
      onInputChange
    });
    return;
  }
  const input = params.input ?? "";
  const mode = params.mode ?? "prompt";
  const rawPastedContents = params.pastedContents ?? {};
  const referencedIds = new Set(parseReferences(input).map((r) => r.id));
  const pastedContents = Object.fromEntries(
    Object.entries(rawPastedContents).filter(
      ([, c]) => c.type !== "image" || referencedIds.has(c.id)
    )
  );
  const hasImages = Object.values(pastedContents).some(isValidImagePaste);
  if (input.trim() === "") {
    return;
  }
  if (!skipSlashCommands && ["exit", "quit", ":q", ":q!", ":wq", ":wq!"].includes(input.trim())) {
    const exitCommand = commands.find((cmd2) => cmd2.name === "exit");
    if (exitCommand) {
      void handlePromptSubmit({
        ...params,
        input: "/exit"
      });
    } else {
      exit();
    }
    return;
  }
  const finalInput = expandPastedTextRefs(input, pastedContents);
  const pastedTextRefs = parseReferences(input).filter(
    (r) => pastedContents[r.id]?.type === "text"
  );
  const pastedTextCount = pastedTextRefs.length;
  const pastedTextBytes = pastedTextRefs.reduce(
    (sum, r) => sum + (pastedContents[r.id]?.content.length ?? 0),
    0
  );
  logEvent("tengu_paste_text", { pastedTextCount, pastedTextBytes });
  if (!skipSlashCommands && finalInput.trim().startsWith("/")) {
    const trimmedInput = finalInput.trim();
    const spaceIndex = trimmedInput.indexOf(" ");
    const commandName = spaceIndex === -1 ? trimmedInput.slice(1) : trimmedInput.slice(1, spaceIndex);
    const commandArgs = spaceIndex === -1 ? "" : trimmedInput.slice(spaceIndex + 1).trim();
    const immediateCommand = commands.find(
      (cmd2) => cmd2.immediate && isCommandEnabled(cmd2) && (cmd2.name === commandName || cmd2.aliases?.includes(commandName) || getCommandName(cmd2) === commandName)
    );
    if (immediateCommand && immediateCommand.type === "local-jsx" && (queryGuard.isActive || isExternalLoading)) {
      logEvent("tengu_immediate_command_executed", {
        commandName: immediateCommand.name
      });
      onInputChange("");
      setCursorOffset(0);
      setPastedContents({});
      clearBuffer();
      const context = getToolUseContext(
        messages,
        [],
        createAbortController(),
        mainLoopModel
      );
      let doneWasCalled = false;
      const onDone = (result, options) => {
        doneWasCalled = true;
        setToolJSX({
          jsx: null,
          shouldHidePromptInput: false,
          clearLocalJSX: true
        });
        if (result && options?.display !== "skip" && params.addNotification) {
          params.addNotification({
            key: `immediate-${immediateCommand.name}`,
            text: result,
            priority: "immediate"
          });
        }
        if (options?.nextInput) {
          if (options.submitNextInput) {
            enqueue({ value: options.nextInput, mode: "prompt" });
          } else {
            onInputChange(options.nextInput);
          }
        }
      };
      const impl = await immediateCommand.load();
      const jsx = await impl.call(onDone, context, commandArgs);
      if (jsx && !doneWasCalled) {
        setToolJSX({
          jsx,
          shouldHidePromptInput: false,
          isLocalJSXCommand: true,
          isImmediate: true
        });
      }
      return;
    }
  }
  if (queryGuard.isActive || isExternalLoading) {
    if (mode !== "prompt" && mode !== "bash") {
      return;
    }
    if (params.hasInterruptibleToolInProgress) {
      logForDebugging(
        `[interrupt] Aborting current turn: streamMode=${params.streamMode}`
      );
      logEvent("tengu_cancel", {
        source: "interrupt_on_submit",
        streamMode: params.streamMode
      });
      params.abortController?.abort("interrupt");
    }
    enqueue({
      value: finalInput.trim(),
      preExpansionValue: input.trim(),
      mode,
      pastedContents: hasImages ? pastedContents : void 0,
      skipSlashCommands,
      uuid
    });
    onInputChange("");
    setCursorOffset(0);
    setPastedContents({});
    resetHistory();
    clearBuffer();
    return;
  }
  startQueryProfile();
  const cmd = {
    value: finalInput,
    preExpansionValue: input,
    mode,
    pastedContents: hasImages ? pastedContents : void 0,
    skipSlashCommands,
    uuid
  };
  await executeUserInput({
    queuedCommands: [cmd],
    messages,
    mainLoopModel,
    ideSelection,
    querySource: params.querySource,
    commands,
    queryGuard,
    setToolJSX,
    getToolUseContext,
    setUserInputOnProcessing,
    setAbortController,
    onQuery,
    setAppState,
    onBeforeQuery,
    resetHistory,
    canUseTool,
    onInputChange
  });
}
async function executeUserInput(params) {
  const {
    messages,
    mainLoopModel,
    ideSelection,
    querySource,
    queryGuard,
    setToolJSX,
    getToolUseContext,
    setUserInputOnProcessing,
    setAbortController,
    onQuery,
    setAppState,
    onBeforeQuery,
    resetHistory,
    canUseTool,
    queuedCommands
  } = params;
  const abortController = createAbortController();
  setAbortController(abortController);
  function makeContext() {
    return getToolUseContext(messages, [], abortController, mainLoopModel);
  }
  try {
    queryGuard.reserve();
    queryCheckpoint("query_process_user_input_start");
    const newMessages = [];
    let shouldQuery = false;
    let allowedTools;
    let model;
    let effort;
    let nextInput;
    let submitNextInput;
    const commands = queuedCommands ?? [];
    const firstWorkload = commands[0]?.workload;
    const turnWorkload = firstWorkload !== void 0 && commands.every((c) => c.workload === firstWorkload) ? firstWorkload : void 0;
    await runWithWorkload(turnWorkload, async () => {
      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i];
        const isFirst = i === 0;
        const result = await processUserInput({
          input: cmd.value,
          preExpansionInput: cmd.preExpansionValue,
          mode: cmd.mode,
          setToolJSX,
          context: makeContext(),
          pastedContents: isFirst ? cmd.pastedContents : void 0,
          messages,
          setUserInputOnProcessing: isFirst ? setUserInputOnProcessing : void 0,
          isAlreadyProcessing: !isFirst,
          querySource,
          canUseTool,
          uuid: cmd.uuid,
          ideSelection: isFirst ? ideSelection : void 0,
          skipSlashCommands: cmd.skipSlashCommands,
          bridgeOrigin: cmd.bridgeOrigin,
          isMeta: cmd.isMeta,
          skipAttachments: !isFirst
        });
        const origin = cmd.origin ?? (cmd.mode === "task-notification" ? { kind: "task-notification" } : void 0);
        if (origin) {
          for (const m of result.messages) {
            if (m.type === "user") m.origin = origin;
          }
        }
        newMessages.push(...result.messages);
        if (isFirst) {
          shouldQuery = result.shouldQuery;
          allowedTools = result.allowedTools;
          model = result.model;
          effort = result.effort;
          nextInput = result.nextInput;
          submitNextInput = result.submitNextInput;
        }
      }
      queryCheckpoint("query_process_user_input_end");
      if (fileHistoryEnabled()) {
        queryCheckpoint("query_file_history_snapshot_start");
        newMessages.filter(selectableUserMessagesFilter).forEach((message) => {
          void fileHistoryMakeSnapshot(
            (updater) => {
              setAppState((prev) => ({
                ...prev,
                fileHistory: updater(prev.fileHistory)
              }));
            },
            message.uuid
          );
        });
        queryCheckpoint("query_file_history_snapshot_end");
      }
      if (newMessages.length) {
        resetHistory();
        setToolJSX({
          jsx: null,
          shouldHidePromptInput: false,
          clearLocalJSX: true
        });
        const primaryCmd = commands[0];
        const primaryMode = primaryCmd?.mode ?? "prompt";
        const primaryInput = primaryCmd && typeof primaryCmd.value === "string" ? primaryCmd.value : void 0;
        const shouldCallBeforeQuery = primaryMode === "prompt";
        await onQuery(
          newMessages,
          abortController,
          shouldQuery,
          allowedTools ?? [],
          model ? resolveSkillModelOverride(model, mainLoopModel) : mainLoopModel,
          shouldCallBeforeQuery ? onBeforeQuery : void 0,
          primaryInput,
          effort
        );
      } else {
        queryGuard.cancelReservation();
        setToolJSX({
          jsx: null,
          shouldHidePromptInput: false,
          clearLocalJSX: true
        });
        resetHistory();
        setAbortController(null);
      }
      if (nextInput) {
        if (submitNextInput) {
          enqueue({ value: nextInput, mode: "prompt" });
        } else {
          params.onInputChange(nextInput);
        }
      }
    });
  } finally {
    queryGuard.cancelReservation();
    setUserInputOnProcessing(void 0);
  }
}
export {
  handlePromptSubmit
};
