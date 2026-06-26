import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { randomUUID } from "crypto";
import figures from "figures";
import { useCallback, useEffect, useMemo, useState } from "react";
import { logEvent } from "../services/analytics/index.js";
import { useAppState } from "../state/AppState.js";
import { fileHistoryCanRestore, fileHistoryEnabled, fileHistoryGetDiffStats } from "../utils/fileHistory.js";
import { logError } from "../utils/log.js";
import { useExitOnCtrlCDWithKeybindings } from "../hooks/useExitOnCtrlCDWithKeybindings.js";
import { Box, Text } from "../ink.js";
import { useKeybinding, useKeybindings } from "../keybindings/useKeybinding.js";
import { stripDisplayTags } from "../utils/displayTags.js";
import { createUserMessage, extractTag, isEmptyMessageText, isSyntheticMessage, isToolUseResultMessage } from "../utils/messages.js";
import { Select } from "./CustomSelect/select.js";
import { Spinner } from "./Spinner.js";
function isTextBlock(block) {
  return block.type === "text";
}
import * as path from "path";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { BASH_STDERR_TAG, BASH_STDOUT_TAG, COMMAND_MESSAGE_TAG, LOCAL_COMMAND_STDERR_TAG, LOCAL_COMMAND_STDOUT_TAG, TASK_NOTIFICATION_TAG, TEAMMATE_MESSAGE_TAG, TICK_TAG } from "../constants/xml.js";
import { count } from "../utils/array.js";
import { formatRelativeTimeAgo, truncate } from "../utils/format.js";
import { Divider } from "./design-system/Divider.js";
function isSummarizeOption(option) {
  return option === "summarize" || option === "summarize_up_to";
}
const MAX_VISIBLE_MESSAGES = 7;
function MessageSelector({
  messages,
  onPreRestore,
  onRestoreMessage,
  onRestoreCode,
  onSummarize,
  onClose,
  preselectedMessage
}) {
  const fileHistory = useAppState((s) => s.fileHistory);
  const [error, setError] = useState(void 0);
  const isFileHistoryEnabled = fileHistoryEnabled();
  const currentUUID = useMemo(randomUUID, []);
  const messageOptions = useMemo(() => [...messages.filter(selectableUserMessagesFilter), {
    ...createUserMessage({
      content: ""
    }),
    uuid: currentUUID
  }], [messages, currentUUID]);
  const [selectedIndex, setSelectedIndex] = useState(messageOptions.length - 1);
  const firstVisibleIndex = Math.max(0, Math.min(selectedIndex - Math.floor(MAX_VISIBLE_MESSAGES / 2), messageOptions.length - MAX_VISIBLE_MESSAGES));
  const hasMessagesToSelect = messageOptions.length > 1;
  const [messageToRestore, setMessageToRestore] = useState(preselectedMessage);
  const [diffStatsForRestore, setDiffStatsForRestore] = useState(void 0);
  useEffect(() => {
    if (!preselectedMessage || !isFileHistoryEnabled) return;
    let cancelled = false;
    void fileHistoryGetDiffStats(fileHistory, preselectedMessage.uuid).then((stats) => {
      if (!cancelled) setDiffStatsForRestore(stats);
    });
    return () => {
      cancelled = true;
    };
  }, [preselectedMessage, isFileHistoryEnabled, fileHistory]);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoringOption, setRestoringOption] = useState(null);
  const [selectedRestoreOption, setSelectedRestoreOption] = useState("both");
  const [summarizeFromFeedback, setSummarizeFromFeedback] = useState("");
  const [summarizeUpToFeedback, setSummarizeUpToFeedback] = useState("");
  function getRestoreOptions(canRestoreCode) {
    const baseOptions = canRestoreCode ? [{
      value: "both",
      label: "Restore code and conversation"
    }, {
      value: "conversation",
      label: "Restore conversation"
    }, {
      value: "code",
      label: "Restore code"
    }] : [{
      value: "conversation",
      label: "Restore conversation"
    }];
    const summarizeInputProps = {
      type: "input",
      placeholder: "add context (optional)",
      initialValue: "",
      allowEmptySubmitToCancel: true,
      showLabelWithValue: true,
      labelValueSeparator: ": "
    };
    baseOptions.push({
      value: "summarize",
      label: "Summarize from here",
      ...summarizeInputProps,
      onChange: setSummarizeFromFeedback
    });
    if (false) {
      baseOptions.push({
        value: "summarize_up_to",
        label: "Summarize up to here",
        ...summarizeInputProps,
        onChange: setSummarizeUpToFeedback
      });
    }
    baseOptions.push({
      value: "nevermind",
      label: "Never mind"
    });
    return baseOptions;
  }
  useEffect(() => {
    logEvent("tengu_message_selector_opened", {});
  }, []);
  async function restoreConversationDirectly(message) {
    onPreRestore();
    setIsRestoring(true);
    try {
      await onRestoreMessage(message);
      setIsRestoring(false);
      onClose();
    } catch (error_0) {
      logError(error_0);
      setIsRestoring(false);
      setError(`Failed to restore the conversation:
${error_0}`);
    }
  }
  async function handleSelect(message_0) {
    const index = messages.indexOf(message_0);
    const indexFromEnd = messages.length - 1 - index;
    logEvent("tengu_message_selector_selected", {
      index_from_end: indexFromEnd,
      message_type: message_0.type,
      is_current_prompt: false
    });
    if (!messages.includes(message_0)) {
      onClose();
      return;
    }
    if (!isFileHistoryEnabled) {
      await restoreConversationDirectly(message_0);
      return;
    }
    const diffStats = await fileHistoryGetDiffStats(fileHistory, message_0.uuid);
    setMessageToRestore(message_0);
    setDiffStatsForRestore(diffStats);
  }
  async function onSelectRestoreOption(option) {
    logEvent("tengu_message_selector_restore_option_selected", {
      option
    });
    if (!messageToRestore) {
      setError("Message not found.");
      return;
    }
    if (option === "nevermind") {
      if (preselectedMessage) onClose();
      else setMessageToRestore(void 0);
      return;
    }
    if (isSummarizeOption(option)) {
      onPreRestore();
      setIsRestoring(true);
      setRestoringOption(option);
      setError(void 0);
      try {
        const direction = option === "summarize_up_to" ? "up_to" : "from";
        const feedback = (direction === "up_to" ? summarizeUpToFeedback : summarizeFromFeedback).trim() || void 0;
        await onSummarize(messageToRestore, feedback, direction);
        setIsRestoring(false);
        setRestoringOption(null);
        setMessageToRestore(void 0);
        onClose();
      } catch (error_1) {
        logError(error_1);
        setIsRestoring(false);
        setRestoringOption(null);
        setMessageToRestore(void 0);
        setError(`Failed to summarize:
${error_1}`);
      }
      return;
    }
    onPreRestore();
    setIsRestoring(true);
    setError(void 0);
    let codeError = null;
    let conversationError = null;
    if (option === "code" || option === "both") {
      try {
        await onRestoreCode(messageToRestore);
      } catch (error_2) {
        codeError = error_2;
        logError(codeError);
      }
    }
    if (option === "conversation" || option === "both") {
      try {
        await onRestoreMessage(messageToRestore);
      } catch (error_3) {
        conversationError = error_3;
        logError(conversationError);
      }
    }
    setIsRestoring(false);
    setMessageToRestore(void 0);
    if (conversationError && codeError) {
      setError(`Failed to restore the conversation and code:
${conversationError}
${codeError}`);
    } else if (conversationError) {
      setError(`Failed to restore the conversation:
${conversationError}`);
    } else if (codeError) {
      setError(`Failed to restore the code:
${codeError}`);
    } else {
      onClose();
    }
  }
  const exitState = useExitOnCtrlCDWithKeybindings();
  const handleEscape = useCallback(() => {
    if (messageToRestore && !preselectedMessage) {
      setMessageToRestore(void 0);
      return;
    }
    logEvent("tengu_message_selector_cancelled", {});
    onClose();
  }, [onClose, messageToRestore, preselectedMessage]);
  const moveUp = useCallback(() => setSelectedIndex((prev) => Math.max(0, prev - 1)), []);
  const moveDown = useCallback(() => setSelectedIndex((prev_0) => Math.min(messageOptions.length - 1, prev_0 + 1)), [messageOptions.length]);
  const jumpToTop = useCallback(() => setSelectedIndex(0), []);
  const jumpToBottom = useCallback(() => setSelectedIndex(messageOptions.length - 1), [messageOptions.length]);
  const handleSelectCurrent = useCallback(() => {
    const selected = messageOptions[selectedIndex];
    if (selected) {
      void handleSelect(selected);
    }
  }, [messageOptions, selectedIndex, handleSelect]);
  useKeybinding("confirm:no", handleEscape, {
    context: "Confirmation",
    isActive: !messageToRestore
  });
  useKeybindings({
    "messageSelector:up": moveUp,
    "messageSelector:down": moveDown,
    "messageSelector:top": jumpToTop,
    "messageSelector:bottom": jumpToBottom,
    "messageSelector:select": handleSelectCurrent
  }, {
    context: "MessageSelector",
    isActive: !isRestoring && !error && !messageToRestore && hasMessagesToSelect
  });
  const [fileHistoryMetadata, setFileHistoryMetadata] = useState({});
  useEffect(() => {
    async function loadFileHistoryMetadata() {
      if (!isFileHistoryEnabled) {
        return;
      }
      void Promise.all(messageOptions.map(async (userMessage, itemIndex) => {
        if (userMessage.uuid !== currentUUID) {
          const canRestore = fileHistoryCanRestore(fileHistory, userMessage.uuid);
          const nextUserMessage = messageOptions.at(itemIndex + 1);
          const diffStats_0 = canRestore ? computeDiffStatsBetweenMessages(messages, userMessage.uuid, nextUserMessage?.uuid !== currentUUID ? nextUserMessage?.uuid : void 0) : void 0;
          if (diffStats_0 !== void 0) {
            setFileHistoryMetadata((prev_1) => ({
              ...prev_1,
              [itemIndex]: diffStats_0
            }));
          } else {
            setFileHistoryMetadata((prev_2) => ({
              ...prev_2,
              [itemIndex]: void 0
            }));
          }
        }
      }));
    }
    void loadFileHistoryMetadata();
  }, [messageOptions, messages, currentUUID, fileHistory, isFileHistoryEnabled]);
  const canRestoreCode_0 = isFileHistoryEnabled && diffStatsForRestore?.filesChanged && diffStatsForRestore.filesChanged.length > 0;
  const showPickList = !error && !messageToRestore && !preselectedMessage && hasMessagesToSelect;
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", width: "100%", children: [
    /* @__PURE__ */ jsx(Divider, { color: "suggestion" }),
    /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginX: 1, gap: 1, children: [
      /* @__PURE__ */ jsx(Text, { bold: true, color: "suggestion", children: "Rewind" }),
      error && /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsxs(Text, { color: "error", children: [
        "Error: ",
        error
      ] }) }),
      !hasMessagesToSelect && /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsx(Text, { children: "Nothing to rewind to yet." }) }),
      !error && messageToRestore && hasMessagesToSelect && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(Text, { children: [
          "Confirm you want to restore",
          " ",
          !diffStatsForRestore && "the conversation ",
          "to the point before you sent this message:"
        ] }),
        /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingLeft: 1, borderStyle: "single", borderRight: false, borderTop: false, borderBottom: false, borderLeft: true, borderLeftDimColor: true, children: [
          /* @__PURE__ */ jsx(UserMessageOption, { userMessage: messageToRestore, color: "text", isCurrent: false }),
          /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
            "(",
            formatRelativeTimeAgo(new Date(messageToRestore.timestamp)),
            ")"
          ] })
        ] }),
        /* @__PURE__ */ jsx(RestoreOptionDescription, { selectedRestoreOption, canRestoreCode: !!canRestoreCode_0, diffStatsForRestore }),
        isRestoring && isSummarizeOption(restoringOption) ? /* @__PURE__ */ jsxs(Box, { flexDirection: "row", gap: 1, children: [
          /* @__PURE__ */ jsx(Spinner, {}),
          /* @__PURE__ */ jsx(Text, { children: "Summarizing\u2026" })
        ] }) : /* @__PURE__ */ jsx(Select, { isDisabled: isRestoring, options: getRestoreOptions(!!canRestoreCode_0), defaultFocusValue: canRestoreCode_0 ? "both" : "conversation", onFocus: (value) => setSelectedRestoreOption(value), onChange: (value_0) => onSelectRestoreOption(value_0), onCancel: () => preselectedMessage ? onClose() : setMessageToRestore(void 0) }),
        canRestoreCode_0 && /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
          figures.warning,
          " Rewinding does not affect files edited manually or via bash."
        ] }) })
      ] }),
      showPickList && /* @__PURE__ */ jsxs(Fragment, { children: [
        isFileHistoryEnabled ? /* @__PURE__ */ jsx(Text, { children: "Restore the code and/or conversation to the point before\u2026" }) : /* @__PURE__ */ jsx(Text, { children: "Restore and fork the conversation to the point before\u2026" }),
        /* @__PURE__ */ jsx(Box, { width: "100%", flexDirection: "column", children: messageOptions.slice(firstVisibleIndex, firstVisibleIndex + MAX_VISIBLE_MESSAGES).map((msg, visibleOptionIndex) => {
          const optionIndex = firstVisibleIndex + visibleOptionIndex;
          const isSelected = optionIndex === selectedIndex;
          const isCurrent = msg.uuid === currentUUID;
          const metadataLoaded = optionIndex in fileHistoryMetadata;
          const metadata = fileHistoryMetadata[optionIndex];
          const numFilesChanged = metadata?.filesChanged && metadata.filesChanged.length;
          return /* @__PURE__ */ jsxs(Box, { height: isFileHistoryEnabled ? 3 : 2, overflow: "hidden", width: "100%", flexDirection: "row", children: [
            /* @__PURE__ */ jsx(Box, { width: 2, minWidth: 2, children: isSelected ? /* @__PURE__ */ jsxs(Text, { color: "permission", bold: true, children: [
              figures.pointer,
              " "
            ] }) : /* @__PURE__ */ jsx(Text, { children: "  " }) }),
            /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
              /* @__PURE__ */ jsx(Box, { flexShrink: 1, height: 1, overflow: "hidden", children: /* @__PURE__ */ jsx(UserMessageOption, { userMessage: msg, color: isSelected ? "suggestion" : void 0, isCurrent, paddingRight: 10 }) }),
              isFileHistoryEnabled && metadataLoaded && /* @__PURE__ */ jsx(Box, { height: 1, flexDirection: "row", children: metadata ? /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsx(Text, { dimColor: !isSelected, color: "inactive", children: numFilesChanged ? /* @__PURE__ */ jsxs(Fragment, { children: [
                numFilesChanged === 1 && metadata.filesChanged[0] ? `${path.basename(metadata.filesChanged[0])} ` : `${numFilesChanged} files changed `,
                /* @__PURE__ */ jsx(DiffStatsText, { diffStats: metadata })
              ] }) : /* @__PURE__ */ jsx(Fragment, { children: "No code changes" }) }) }) : /* @__PURE__ */ jsxs(Text, { dimColor: true, color: "warning", children: [
                figures.warning,
                " No code restore"
              ] }) })
            ] })
          ] }, msg.uuid);
        }) })
      ] }),
      !messageToRestore && /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: exitState.pending ? /* @__PURE__ */ jsxs(Fragment, { children: [
        "Press ",
        exitState.keyName,
        " again to exit"
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        !error && hasMessagesToSelect && "Enter to continue \xB7 ",
        "Esc to exit"
      ] }) })
    ] })
  ] });
}
function getRestoreOptionConversationText(option) {
  switch (option) {
    case "summarize":
      return "Messages after this point will be summarized.";
    case "summarize_up_to":
      return "Preceding messages will be summarized. This and subsequent messages will remain unchanged \u2014 you will stay at the end of the conversation.";
    case "both":
    case "conversation":
      return "The conversation will be forked.";
    case "code":
    case "nevermind":
      return "The conversation will be unchanged.";
  }
}
function RestoreOptionDescription(t0) {
  const $ = _c(11);
  const {
    selectedRestoreOption,
    canRestoreCode,
    diffStatsForRestore
  } = t0;
  const showCodeRestore = canRestoreCode && (selectedRestoreOption === "both" || selectedRestoreOption === "code");
  let t1;
  if ($[0] !== selectedRestoreOption) {
    t1 = getRestoreOptionConversationText(selectedRestoreOption);
    $[0] = selectedRestoreOption;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== t1) {
    t2 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: t1 });
    $[2] = t1;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== diffStatsForRestore || $[5] !== selectedRestoreOption || $[6] !== showCodeRestore) {
    t3 = !isSummarizeOption(selectedRestoreOption) && (showCodeRestore ? /* @__PURE__ */ jsx(RestoreCodeConfirmation, { diffStatsForRestore }) : /* @__PURE__ */ jsx(Text, { dimColor: true, children: "The code will be unchanged." }));
    $[4] = diffStatsForRestore;
    $[5] = selectedRestoreOption;
    $[6] = showCodeRestore;
    $[7] = t3;
  } else {
    t3 = $[7];
  }
  let t4;
  if ($[8] !== t2 || $[9] !== t3) {
    t4 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      t2,
      t3
    ] });
    $[8] = t2;
    $[9] = t3;
    $[10] = t4;
  } else {
    t4 = $[10];
  }
  return t4;
}
function RestoreCodeConfirmation(t0) {
  const $ = _c(14);
  const {
    diffStatsForRestore
  } = t0;
  if (diffStatsForRestore === void 0) {
    return;
  }
  if (!diffStatsForRestore.filesChanged || !diffStatsForRestore.filesChanged[0]) {
    let t12;
    if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: "The code has not changed (nothing will be restored)." });
      $[0] = t12;
    } else {
      t12 = $[0];
    }
    return t12;
  }
  const numFilesChanged = diffStatsForRestore.filesChanged.length;
  let fileLabel;
  if (numFilesChanged === 1) {
    let t12;
    if ($[1] !== diffStatsForRestore.filesChanged[0]) {
      t12 = path.basename(diffStatsForRestore.filesChanged[0] || "");
      $[1] = diffStatsForRestore.filesChanged[0];
      $[2] = t12;
    } else {
      t12 = $[2];
    }
    fileLabel = t12;
  } else {
    if (numFilesChanged === 2) {
      let t12;
      if ($[3] !== diffStatsForRestore.filesChanged[0]) {
        t12 = path.basename(diffStatsForRestore.filesChanged[0] || "");
        $[3] = diffStatsForRestore.filesChanged[0];
        $[4] = t12;
      } else {
        t12 = $[4];
      }
      const file1 = t12;
      let t22;
      if ($[5] !== diffStatsForRestore.filesChanged[1]) {
        t22 = path.basename(diffStatsForRestore.filesChanged[1] || "");
        $[5] = diffStatsForRestore.filesChanged[1];
        $[6] = t22;
      } else {
        t22 = $[6];
      }
      const file2 = t22;
      fileLabel = `${file1} and ${file2}`;
    } else {
      let t12;
      if ($[7] !== diffStatsForRestore.filesChanged[0]) {
        t12 = path.basename(diffStatsForRestore.filesChanged[0] || "");
        $[7] = diffStatsForRestore.filesChanged[0];
        $[8] = t12;
      } else {
        t12 = $[8];
      }
      const file1_0 = t12;
      fileLabel = `${file1_0} and ${diffStatsForRestore.filesChanged.length - 1} other files`;
    }
  }
  let t1;
  if ($[9] !== diffStatsForRestore) {
    t1 = /* @__PURE__ */ jsx(DiffStatsText, { diffStats: diffStatsForRestore });
    $[9] = diffStatsForRestore;
    $[10] = t1;
  } else {
    t1 = $[10];
  }
  let t2;
  if ($[11] !== fileLabel || $[12] !== t1) {
    t2 = /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "The code will be restored",
      " ",
      t1,
      " in ",
      fileLabel,
      "."
    ] }) });
    $[11] = fileLabel;
    $[12] = t1;
    $[13] = t2;
  } else {
    t2 = $[13];
  }
  return t2;
}
function DiffStatsText(t0) {
  const $ = _c(7);
  const {
    diffStats
  } = t0;
  if (!diffStats || !diffStats.filesChanged) {
    return;
  }
  let t1;
  if ($[0] !== diffStats.insertions) {
    t1 = /* @__PURE__ */ jsxs(Text, { color: "diffAddedWord", children: [
      "+",
      diffStats.insertions,
      " "
    ] });
    $[0] = diffStats.insertions;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== diffStats.deletions) {
    t2 = /* @__PURE__ */ jsxs(Text, { color: "diffRemovedWord", children: [
      "-",
      diffStats.deletions
    ] });
    $[2] = diffStats.deletions;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== t1 || $[5] !== t2) {
    t3 = /* @__PURE__ */ jsxs(Fragment, { children: [
      t1,
      t2
    ] });
    $[4] = t1;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}
function UserMessageOption(t0) {
  const $ = _c(31);
  const {
    userMessage,
    color,
    dimColor,
    isCurrent,
    paddingRight
  } = t0;
  const {
    columns
  } = useTerminalSize();
  if (isCurrent) {
    let t12;
    if ($[0] !== color || $[1] !== dimColor) {
      t12 = /* @__PURE__ */ jsx(Box, { width: "100%", children: /* @__PURE__ */ jsx(Text, { italic: true, color, dimColor, children: "(current)" }) });
      $[0] = color;
      $[1] = dimColor;
      $[2] = t12;
    } else {
      t12 = $[2];
    }
    return t12;
  }
  const content = userMessage.message.content;
  const lastBlock = typeof content === "string" ? null : content[content.length - 1];
  let T0;
  let T1;
  let t1;
  let t2;
  let t3;
  let t4;
  let t5;
  let t6;
  if ($[3] !== color || $[4] !== columns || $[5] !== content || $[6] !== dimColor || $[7] !== lastBlock || $[8] !== paddingRight) {
    t6 = /* @__PURE__ */ Symbol.for("react.early_return_sentinel");
    bb0: {
      const rawMessageText = typeof content === "string" ? content.trim() : lastBlock && isTextBlock(lastBlock) ? lastBlock.text.trim() : "(no prompt)";
      const messageText = stripDisplayTags(rawMessageText);
      if (isEmptyMessageText(messageText)) {
        let t72;
        if ($[17] !== color || $[18] !== dimColor) {
          t72 = /* @__PURE__ */ jsx(Box, { flexDirection: "row", width: "100%", children: /* @__PURE__ */ jsx(Text, { italic: true, color, dimColor, children: "((empty message))" }) });
          $[17] = color;
          $[18] = dimColor;
          $[19] = t72;
        } else {
          t72 = $[19];
        }
        t6 = t72;
        break bb0;
      }
      if (messageText.includes("<bash-input>")) {
        const input = extractTag(messageText, "bash-input");
        if (input) {
          let t72;
          if ($[20] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
            t72 = /* @__PURE__ */ jsx(Text, { color: "bashBorder", children: "!" });
            $[20] = t72;
          } else {
            t72 = $[20];
          }
          t6 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", width: "100%", children: [
            t72,
            /* @__PURE__ */ jsxs(Text, { color, dimColor, children: [
              " ",
              input
            ] })
          ] });
          break bb0;
        }
      }
      if (messageText.includes(`<${COMMAND_MESSAGE_TAG}>`)) {
        const commandMessage = extractTag(messageText, COMMAND_MESSAGE_TAG);
        const args = extractTag(messageText, "command-args");
        const isSkillFormat = extractTag(messageText, "skill-format") === "true";
        if (commandMessage) {
          if (isSkillFormat) {
            t6 = /* @__PURE__ */ jsx(Box, { flexDirection: "row", width: "100%", children: /* @__PURE__ */ jsxs(Text, { color, dimColor, children: [
              "Skill(",
              commandMessage,
              ")"
            ] }) });
            break bb0;
          } else {
            t6 = /* @__PURE__ */ jsx(Box, { flexDirection: "row", width: "100%", children: /* @__PURE__ */ jsxs(Text, { color, dimColor, children: [
              "/",
              commandMessage,
              " ",
              args
            ] }) });
            break bb0;
          }
        }
      }
      T1 = Box;
      t4 = "row";
      t5 = "100%";
      T0 = Text;
      t1 = color;
      t2 = dimColor;
      t3 = paddingRight ? truncate(messageText, columns - paddingRight, true) : messageText.slice(0, 500).split("\n").slice(0, 4).join("\n");
    }
    $[3] = color;
    $[4] = columns;
    $[5] = content;
    $[6] = dimColor;
    $[7] = lastBlock;
    $[8] = paddingRight;
    $[9] = T0;
    $[10] = T1;
    $[11] = t1;
    $[12] = t2;
    $[13] = t3;
    $[14] = t4;
    $[15] = t5;
    $[16] = t6;
  } else {
    T0 = $[9];
    T1 = $[10];
    t1 = $[11];
    t2 = $[12];
    t3 = $[13];
    t4 = $[14];
    t5 = $[15];
    t6 = $[16];
  }
  if (t6 !== /* @__PURE__ */ Symbol.for("react.early_return_sentinel")) {
    return t6;
  }
  let t7;
  if ($[21] !== T0 || $[22] !== t1 || $[23] !== t2 || $[24] !== t3) {
    t7 = /* @__PURE__ */ jsx(T0, { color: t1, dimColor: t2, children: t3 });
    $[21] = T0;
    $[22] = t1;
    $[23] = t2;
    $[24] = t3;
    $[25] = t7;
  } else {
    t7 = $[25];
  }
  let t8;
  if ($[26] !== T1 || $[27] !== t4 || $[28] !== t5 || $[29] !== t7) {
    t8 = /* @__PURE__ */ jsx(T1, { flexDirection: t4, width: t5, children: t7 });
    $[26] = T1;
    $[27] = t4;
    $[28] = t5;
    $[29] = t7;
    $[30] = t8;
  } else {
    t8 = $[30];
  }
  return t8;
}
function computeDiffStatsBetweenMessages(messages, fromMessageId, toMessageId) {
  const startIndex = messages.findIndex((msg) => msg.uuid === fromMessageId);
  if (startIndex === -1) {
    return void 0;
  }
  let endIndex = toMessageId ? messages.findIndex((msg) => msg.uuid === toMessageId) : messages.length;
  if (endIndex === -1) {
    endIndex = messages.length;
  }
  const filesChanged = [];
  let insertions = 0;
  let deletions = 0;
  for (let i = startIndex + 1; i < endIndex; i++) {
    const msg = messages[i];
    if (!msg || !isToolUseResultMessage(msg)) {
      continue;
    }
    const result = msg.toolUseResult;
    if (!result || !result.filePath || !result.structuredPatch) {
      continue;
    }
    if (!filesChanged.includes(result.filePath)) {
      filesChanged.push(result.filePath);
    }
    try {
      if ("type" in result && result.type === "create") {
        insertions += result.content.split(/\r?\n/).length;
      } else {
        for (const hunk of result.structuredPatch) {
          const additions = count(hunk.lines, (line) => line.startsWith("+"));
          const removals = count(hunk.lines, (line) => line.startsWith("-"));
          insertions += additions;
          deletions += removals;
        }
      }
    } catch {
      continue;
    }
  }
  return {
    filesChanged,
    insertions,
    deletions
  };
}
function selectableUserMessagesFilter(message) {
  if (message.type !== "user") {
    return false;
  }
  if (Array.isArray(message.message.content) && message.message.content[0]?.type === "tool_result") {
    return false;
  }
  if (isSyntheticMessage(message)) {
    return false;
  }
  if (message.isMeta) {
    return false;
  }
  if (message.isCompactSummary || message.isVisibleInTranscriptOnly) {
    return false;
  }
  const content = message.message.content;
  const lastBlock = typeof content === "string" ? null : content[content.length - 1];
  const messageText = typeof content === "string" ? content.trim() : lastBlock && isTextBlock(lastBlock) ? lastBlock.text.trim() : "";
  if (messageText.indexOf(`<${LOCAL_COMMAND_STDOUT_TAG}>`) !== -1 || messageText.indexOf(`<${LOCAL_COMMAND_STDERR_TAG}>`) !== -1 || messageText.indexOf(`<${BASH_STDOUT_TAG}>`) !== -1 || messageText.indexOf(`<${BASH_STDERR_TAG}>`) !== -1 || messageText.indexOf(`<${TASK_NOTIFICATION_TAG}>`) !== -1 || messageText.indexOf(`<${TICK_TAG}>`) !== -1 || messageText.indexOf(`<${TEAMMATE_MESSAGE_TAG}`) !== -1) {
    return false;
  }
  return true;
}
function messagesAfterAreOnlySynthetic(messages, fromIndex) {
  for (let i = fromIndex + 1; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;
    if (isSyntheticMessage(msg)) continue;
    if (isToolUseResultMessage(msg)) continue;
    if (msg.type === "progress") continue;
    if (msg.type === "system") continue;
    if (msg.type === "attachment") continue;
    if (msg.type === "user" && msg.isMeta) continue;
    if (msg.type === "assistant") {
      const content = msg.message.content;
      if (Array.isArray(content)) {
        const hasMeaningfulContent = content.some((block) => block.type === "text" && block.text.trim() || block.type === "tool_use");
        if (hasMeaningfulContent) return false;
      }
      continue;
    }
    if (msg.type === "user") {
      return false;
    }
  }
  return true;
}
export {
  MessageSelector,
  messagesAfterAreOnlySynthetic,
  selectableUserMessagesFilter
};
