import { runAgent } from "../../tools/AgentTool/runAgent.js";
import { FILE_EDIT_TOOL_NAME } from "../../tools/FileEditTool/constants.js";
import {
  FileReadTool,
  registerFileReadListener
} from "../../tools/FileReadTool/FileReadTool.js";
import { isFsInaccessible } from "../../utils/errors.js";
import { cloneFileStateCache } from "../../utils/fileStateCache.js";
import {
  registerPostSamplingHook
} from "../../utils/hooks/postSamplingHooks.js";
import {
  createUserMessage,
  hasToolCallsInLastAssistantTurn
} from "../../utils/messages.js";
import { sequential } from "../../utils/sequential.js";
import { buildMagicDocsUpdatePrompt } from "./prompts.js";
const MAGIC_DOC_HEADER_PATTERN = /^#\s*MAGIC\s+DOC:\s*(.+)$/im;
const ITALICS_PATTERN = /^[_*](.+?)[_*]\s*$/m;
const trackedMagicDocs = /* @__PURE__ */ new Map();
function clearTrackedMagicDocs() {
  trackedMagicDocs.clear();
}
function detectMagicDocHeader(content) {
  const match = content.match(MAGIC_DOC_HEADER_PATTERN);
  if (!match || !match[1]) {
    return null;
  }
  const title = match[1].trim();
  const headerEndIndex = match.index + match[0].length;
  const afterHeader = content.slice(headerEndIndex);
  const nextLineMatch = afterHeader.match(/^\s*\n(?:\s*\n)?(.+?)(?:\n|$)/);
  if (nextLineMatch && nextLineMatch[1]) {
    const nextLine = nextLineMatch[1];
    const italicsMatch = nextLine.match(ITALICS_PATTERN);
    if (italicsMatch && italicsMatch[1]) {
      const instructions = italicsMatch[1].trim();
      return {
        title,
        instructions
      };
    }
  }
  return { title };
}
function registerMagicDoc(filePath) {
  if (!trackedMagicDocs.has(filePath)) {
    trackedMagicDocs.set(filePath, {
      path: filePath
    });
  }
}
function getMagicDocsAgent() {
  return {
    agentType: "magic-docs",
    whenToUse: "Update Magic Docs",
    tools: [FILE_EDIT_TOOL_NAME],
    // Only allow Edit
    model: "sonnet",
    source: "built-in",
    baseDir: "built-in",
    getSystemPrompt: () => ""
    // Will use override systemPrompt
  };
}
async function updateMagicDoc(docInfo, context) {
  const { messages, systemPrompt, userContext, systemContext, toolUseContext } = context;
  const clonedReadFileState = cloneFileStateCache(toolUseContext.readFileState);
  clonedReadFileState.delete(docInfo.path);
  const clonedToolUseContext = {
    ...toolUseContext,
    readFileState: clonedReadFileState
  };
  let currentDoc = "";
  try {
    const result = await FileReadTool.call(
      { file_path: docInfo.path },
      clonedToolUseContext
    );
    const output = result.data;
    if (output.type === "text") {
      currentDoc = output.file.content;
    }
  } catch (e) {
    if (isFsInaccessible(e) || e instanceof Error && e.message.startsWith("File does not exist")) {
      trackedMagicDocs.delete(docInfo.path);
      return;
    }
    throw e;
  }
  const detected = detectMagicDocHeader(currentDoc);
  if (!detected) {
    trackedMagicDocs.delete(docInfo.path);
    return;
  }
  const userPrompt = await buildMagicDocsUpdatePrompt(
    currentDoc,
    docInfo.path,
    detected.title,
    detected.instructions
  );
  const canUseTool = async (tool, input) => {
    if (tool.name === FILE_EDIT_TOOL_NAME && typeof input === "object" && input !== null && "file_path" in input) {
      const filePath = input.file_path;
      if (typeof filePath === "string" && filePath === docInfo.path) {
        return { behavior: "allow", updatedInput: input };
      }
    }
    return {
      behavior: "deny",
      message: `only ${FILE_EDIT_TOOL_NAME} is allowed for ${docInfo.path}`,
      decisionReason: {
        type: "other",
        reason: `only ${FILE_EDIT_TOOL_NAME} is allowed`
      }
    };
  };
  for await (const _message of runAgent({
    agentDefinition: getMagicDocsAgent(),
    promptMessages: [createUserMessage({ content: userPrompt })],
    toolUseContext: clonedToolUseContext,
    canUseTool,
    isAsync: true,
    forkContextMessages: messages,
    querySource: "magic_docs",
    override: {
      systemPrompt,
      userContext,
      systemContext
    },
    availableTools: clonedToolUseContext.options.tools
  })) {
  }
}
const updateMagicDocs = sequential(async function(context) {
  const { messages, querySource } = context;
  if (querySource !== "repl_main_thread") {
    return;
  }
  const hasToolCalls = hasToolCallsInLastAssistantTurn(messages);
  if (hasToolCalls) {
    return;
  }
  const docCount = trackedMagicDocs.size;
  if (docCount === 0) {
    return;
  }
  for (const docInfo of Array.from(trackedMagicDocs.values())) {
    await updateMagicDoc(docInfo, context);
  }
});
async function initMagicDocs() {
  if (process.env.USER_TYPE === "ant") {
    registerFileReadListener((filePath, content) => {
      const result = detectMagicDocHeader(content);
      if (result) {
        registerMagicDoc(filePath);
      }
    });
    registerPostSamplingHook(updateMagicDocs);
  }
}
export {
  clearTrackedMagicDocs,
  detectMagicDocHeader,
  initMagicDocs,
  registerMagicDoc
};
