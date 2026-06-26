import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { randomUUID } from "crypto";
import { BashModeProgress } from "../../components/BashModeProgress.js";
import { BashTool } from "../../tools/BashTool/BashTool.js";
import { logEvent } from "../../services/analytics/index.js";
import { errorMessage, ShellError } from "../errors.js";
import { createSyntheticUserCaveatMessage, createUserInterruptionMessage, createUserMessage, prepareUserContent } from "../messages.js";
import { resolveDefaultShell } from "../shell/resolveDefaultShell.js";
import { isPowerShellToolEnabled } from "../shell/shellToolUtils.js";
import { processToolResultBlock } from "../toolResultStorage.js";
import { escapeXml } from "../xml.js";
async function processBashCommand(inputString, precedingInputBlocks, attachmentMessages, context, setToolJSX) {
  const usePowerShell = isPowerShellToolEnabled() && resolveDefaultShell() === "powershell";
  logEvent("tengu_input_bash", {
    powershell: usePowerShell
  });
  const userMessage = createUserMessage({
    content: prepareUserContent({
      inputString: `<bash-input>${inputString}</bash-input>`,
      precedingInputBlocks
    })
  });
  let jsx2;
  setToolJSX({
    jsx: /* @__PURE__ */ jsx(BashModeProgress, { input: inputString, progress: null, verbose: context.options.verbose }),
    shouldHidePromptInput: false
  });
  try {
    const bashModeContext = {
      ...context,
      // TODO: Clean up this hack
      setToolJSX: (_) => {
        jsx2 = _?.jsx;
      }
    };
    const onProgress = (progress) => {
      setToolJSX({
        jsx: /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(BashModeProgress, { input: inputString, progress: progress.data, verbose: context.options.verbose }),
          jsx2
        ] }),
        shouldHidePromptInput: false,
        showSpinner: false
      });
    };
    let PowerShellTool = null;
    if (usePowerShell) {
      PowerShellTool = require("../../tools/PowerShellTool/PowerShellTool.js").PowerShellTool;
    }
    const shellTool = PowerShellTool ?? BashTool;
    const response = PowerShellTool ? await PowerShellTool.call({
      command: inputString,
      dangerouslyDisableSandbox: true
    }, bashModeContext, void 0, void 0, onProgress) : await BashTool.call({
      command: inputString,
      dangerouslyDisableSandbox: true
    }, bashModeContext, void 0, void 0, onProgress);
    const data = response.data;
    if (!data) {
      throw new Error("No result received from shell command");
    }
    const stderr = data.stderr;
    const mapped = await processToolResultBlock(shellTool, {
      ...data,
      stderr: ""
    }, randomUUID());
    const stdout = typeof mapped.content === "string" ? mapped.content : escapeXml(data.stdout);
    return {
      messages: [createSyntheticUserCaveatMessage(), userMessage, ...attachmentMessages, createUserMessage({
        content: `<bash-stdout>${stdout}</bash-stdout><bash-stderr>${escapeXml(stderr)}</bash-stderr>`
      })],
      shouldQuery: false
    };
  } catch (e) {
    if (e instanceof ShellError) {
      if (e.interrupted) {
        return {
          messages: [createSyntheticUserCaveatMessage(), userMessage, createUserInterruptionMessage({
            toolUse: false
          }), ...attachmentMessages],
          shouldQuery: false
        };
      }
      return {
        messages: [createSyntheticUserCaveatMessage(), userMessage, ...attachmentMessages, createUserMessage({
          content: `<bash-stdout>${escapeXml(e.stdout)}</bash-stdout><bash-stderr>${escapeXml(e.stderr)}</bash-stderr>`
        })],
        shouldQuery: false
      };
    }
    return {
      messages: [createSyntheticUserCaveatMessage(), userMessage, ...attachmentMessages, createUserMessage({
        content: `<bash-stderr>Command failed: ${escapeXml(errorMessage(e))}</bash-stderr>`
      })],
      shouldQuery: false
    };
  } finally {
    setToolJSX(null);
  }
}
export {
  processBashCommand
};
