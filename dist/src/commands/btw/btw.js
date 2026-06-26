import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useEffect, useRef, useState } from "react";
import { useInterval } from "usehooks-ts";
import { Markdown } from "../../components/Markdown.js";
import { SpinnerGlyph } from "../../components/Spinner/SpinnerGlyph.js";
import { DOWN_ARROW, UP_ARROW } from "../../constants/figures.js";
import { getSystemPrompt } from "../../constants/prompts.js";
import { useModalOrTerminalSize } from "../../context/modalContext.js";
import { getSystemContext, getUserContext } from "../../context.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";
import ScrollBox from "../../ink/components/ScrollBox.js";
import { Box, Text } from "../../ink.js";
import { createAbortController } from "../../utils/abortController.js";
import { saveGlobalConfig } from "../../utils/config.js";
import { errorMessage } from "../../utils/errors.js";
import { getLastCacheSafeParams } from "../../utils/forkedAgent.js";
import { getMessagesAfterCompactBoundary } from "../../utils/messages.js";
import { runSideQuestion } from "../../utils/sideQuestion.js";
import { asSystemPrompt } from "../../utils/systemPromptType.js";
const CHROME_ROWS = 5;
const OUTER_CHROME_ROWS = 6;
const SCROLL_LINES = 3;
function BtwSideQuestion(t0) {
  const $ = _c(25);
  const {
    question,
    context,
    onDone
  } = t0;
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [frame, setFrame] = useState(0);
  const scrollRef = useRef(null);
  const {
    rows
  } = useModalOrTerminalSize(useTerminalSize());
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => setFrame(_temp);
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  useInterval(t1, response || error ? null : 80);
  let t2;
  if ($[1] !== onDone) {
    t2 = function handleKeyDown2(e) {
      if (e.key === "escape" || e.key === "return" || e.key === " " || e.ctrl && (e.key === "c" || e.key === "d")) {
        e.preventDefault();
        onDone(void 0, {
          display: "skip"
        });
        return;
      }
      if (e.key === "up" || e.ctrl && e.key === "p") {
        e.preventDefault();
        scrollRef.current?.scrollBy(-SCROLL_LINES);
      }
      if (e.key === "down" || e.ctrl && e.key === "n") {
        e.preventDefault();
        scrollRef.current?.scrollBy(SCROLL_LINES);
      }
    };
    $[1] = onDone;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  const handleKeyDown = t2;
  let t3;
  let t4;
  if ($[3] !== context || $[4] !== question) {
    t3 = () => {
      const abortController = createAbortController();
      const fetchResponse = async function fetchResponse2() {
        ;
        try {
          const cacheSafeParams = await buildCacheSafeParams(context);
          const result = await runSideQuestion({
            question,
            cacheSafeParams
          });
          if (!abortController.signal.aborted) {
            if (result.response) {
              setResponse(result.response);
            } else {
              setError("No response received");
            }
          }
        } catch (t52) {
          const err = t52;
          if (!abortController.signal.aborted) {
            setError(errorMessage(err) || "Failed to get response");
          }
        }
      };
      fetchResponse();
      return () => {
        abortController.abort();
      };
    };
    t4 = [question, context];
    $[3] = context;
    $[4] = question;
    $[5] = t3;
    $[6] = t4;
  } else {
    t3 = $[5];
    t4 = $[6];
  }
  useEffect(t3, t4);
  const maxContentHeight = Math.max(5, rows - CHROME_ROWS - OUTER_CHROME_ROWS);
  let t5;
  if ($[7] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t5 = /* @__PURE__ */ jsxs(Text, { color: "warning", bold: true, children: [
      "/btw",
      " "
    ] });
    $[7] = t5;
  } else {
    t5 = $[7];
  }
  let t6;
  if ($[8] !== question) {
    t6 = /* @__PURE__ */ jsxs(Box, { children: [
      t5,
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: question })
    ] });
    $[8] = question;
    $[9] = t6;
  } else {
    t6 = $[9];
  }
  let t7;
  if ($[10] !== error || $[11] !== frame || $[12] !== response) {
    t7 = /* @__PURE__ */ jsx(ScrollBox, { ref: scrollRef, flexDirection: "column", flexGrow: 1, children: error ? /* @__PURE__ */ jsx(Text, { color: "error", children: error }) : response ? /* @__PURE__ */ jsx(Markdown, { children: response }) : /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(SpinnerGlyph, { frame, messageColor: "warning" }),
      /* @__PURE__ */ jsx(Text, { color: "warning", children: "Answering..." })
    ] }) });
    $[10] = error;
    $[11] = frame;
    $[12] = response;
    $[13] = t7;
  } else {
    t7 = $[13];
  }
  let t8;
  if ($[14] !== maxContentHeight || $[15] !== t7) {
    t8 = /* @__PURE__ */ jsx(Box, { marginTop: 1, marginLeft: 2, maxHeight: maxContentHeight, children: t7 });
    $[14] = maxContentHeight;
    $[15] = t7;
    $[16] = t8;
  } else {
    t8 = $[16];
  }
  let t9;
  if ($[17] !== error || $[18] !== response) {
    t9 = (response || error) && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      UP_ARROW,
      "/",
      DOWN_ARROW,
      " to scroll \xB7 Space, Enter, or Escape to dismiss"
    ] }) });
    $[17] = error;
    $[18] = response;
    $[19] = t9;
  } else {
    t9 = $[19];
  }
  let t10;
  if ($[20] !== handleKeyDown || $[21] !== t6 || $[22] !== t8 || $[23] !== t9) {
    t10 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingLeft: 2, marginTop: 1, tabIndex: 0, autoFocus: true, onKeyDown: handleKeyDown, children: [
      t6,
      t8,
      t9
    ] });
    $[20] = handleKeyDown;
    $[21] = t6;
    $[22] = t8;
    $[23] = t9;
    $[24] = t10;
  } else {
    t10 = $[24];
  }
  return t10;
}
function _temp(f) {
  return f + 1;
}
function stripInProgressAssistantMessage(messages) {
  const last = messages.at(-1);
  if (last?.type === "assistant" && last.message.stop_reason === null) {
    return messages.slice(0, -1);
  }
  return messages;
}
async function buildCacheSafeParams(context) {
  const forkContextMessages = getMessagesAfterCompactBoundary(stripInProgressAssistantMessage(context.messages));
  const saved = getLastCacheSafeParams();
  if (saved) {
    return {
      systemPrompt: saved.systemPrompt,
      userContext: saved.userContext,
      systemContext: saved.systemContext,
      toolUseContext: context,
      forkContextMessages
    };
  }
  const [rawSystemPrompt, userContext, systemContext] = await Promise.all([getSystemPrompt(context.options.tools, context.options.mainLoopModel, [], context.options.mcpClients), getUserContext(), getSystemContext()]);
  return {
    systemPrompt: asSystemPrompt(rawSystemPrompt),
    userContext,
    systemContext,
    toolUseContext: context,
    forkContextMessages
  };
}
async function call(onDone, context, args) {
  const question = args?.trim();
  if (!question) {
    onDone("Usage: /btw <your question>", {
      display: "system"
    });
    return null;
  }
  saveGlobalConfig((current) => ({
    ...current,
    btwUseCount: current.btwUseCount + 1
  }));
  return /* @__PURE__ */ jsx(BtwSideQuestion, { question, context, onDone });
}
export {
  call
};
