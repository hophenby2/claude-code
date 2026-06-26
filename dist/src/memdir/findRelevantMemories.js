const feature = (_name) => false;
import { logForDebugging } from "../utils/debug.js";
import { errorMessage } from "../utils/errors.js";
import { getDefaultSonnetModel } from "../utils/model/model.js";
import { sideQuery } from "../utils/sideQuery.js";
import { jsonParse } from "../utils/slowOperations.js";
import {
  formatMemoryManifest,
  scanMemoryFiles
} from "./memoryScan.js";
const SELECT_MEMORIES_SYSTEM_PROMPT = `You are selecting memories that will be useful to Claude Code as it processes a user's query. You will be given the user's query and a list of available memory files with their filenames and descriptions.

Return a list of filenames for the memories that will clearly be useful to Claude Code as it processes the user's query (up to 5). Only include memories that you are certain will be helpful based on their name and description.
- If you are unsure if a memory will be useful in processing the user's query, then do not include it in your list. Be selective and discerning.
- If there are no memories in the list that would clearly be useful, feel free to return an empty list.
- If a list of recently-used tools is provided, do not select memories that are usage reference or API documentation for those tools (Claude Code is already exercising them). DO still select memories containing warnings, gotchas, or known issues about those tools \u2014 active use is exactly when those matter.
`;
async function findRelevantMemories(query, memoryDir, signal, recentTools = [], alreadySurfaced = /* @__PURE__ */ new Set()) {
  const memories = (await scanMemoryFiles(memoryDir, signal)).filter(
    (m) => !alreadySurfaced.has(m.filePath)
  );
  if (memories.length === 0) {
    return [];
  }
  const selectedFilenames = await selectRelevantMemories(
    query,
    memories,
    signal,
    recentTools
  );
  const byFilename = new Map(memories.map((m) => [m.filename, m]));
  const selected = selectedFilenames.map((filename) => byFilename.get(filename)).filter((m) => m !== void 0);
  if (false) {
    const { logMemoryRecallShape } = null;
    logMemoryRecallShape(memories, selected);
  }
  return selected.map((m) => ({ path: m.filePath, mtimeMs: m.mtimeMs }));
}
async function selectRelevantMemories(query, memories, signal, recentTools) {
  const validFilenames = new Set(memories.map((m) => m.filename));
  const manifest = formatMemoryManifest(memories);
  const toolsSection = recentTools.length > 0 ? `

Recently used tools: ${recentTools.join(", ")}` : "";
  try {
    const result = await sideQuery({
      model: getDefaultSonnetModel(),
      system: SELECT_MEMORIES_SYSTEM_PROMPT,
      skipSystemPromptPrefix: true,
      messages: [
        {
          role: "user",
          content: `Query: ${query}

Available memories:
${manifest}${toolsSection}`
        }
      ],
      max_tokens: 256,
      output_format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            selected_memories: { type: "array", items: { type: "string" } }
          },
          required: ["selected_memories"],
          additionalProperties: false
        }
      },
      signal,
      querySource: "memdir_relevance"
    });
    const textBlock = result.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return [];
    }
    const parsed = jsonParse(textBlock.text);
    return parsed.selected_memories.filter((f) => validFilenames.has(f));
  } catch (e) {
    if (signal.aborted) {
      return [];
    }
    logForDebugging(
      `[memdir] selectRelevantMemories failed: ${errorMessage(e)}`,
      { level: "warn" }
    );
    return [];
  }
}
export {
  findRelevantMemories
};
