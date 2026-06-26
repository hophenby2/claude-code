import {
  INTERRUPT_MESSAGE,
  INTERRUPT_MESSAGE_FOR_TOOL_USE
} from "./messages.js";
const SYSTEM_REMINDER_CLOSE = "</system-reminder>";
const RENDERED_AS_SENTINEL = /* @__PURE__ */ new Set([
  INTERRUPT_MESSAGE,
  INTERRUPT_MESSAGE_FOR_TOOL_USE
]);
const searchTextCache = /* @__PURE__ */ new WeakMap();
function renderableSearchText(msg) {
  const cached = searchTextCache.get(msg);
  if (cached !== void 0) return cached;
  const result = computeSearchText(msg).toLowerCase();
  searchTextCache.set(msg, result);
  return result;
}
function computeSearchText(msg) {
  let raw = "";
  switch (msg.type) {
    case "user": {
      const c = msg.message.content;
      if (typeof c === "string") {
        raw = RENDERED_AS_SENTINEL.has(c) ? "" : c;
      } else {
        const parts = [];
        for (const b of c) {
          if (b.type === "text") {
            if (!RENDERED_AS_SENTINEL.has(b.text)) parts.push(b.text);
          } else if (b.type === "tool_result") {
            parts.push(toolResultSearchText(msg.toolUseResult));
          }
        }
        raw = parts.join("\n");
      }
      break;
    }
    case "assistant": {
      const c = msg.message.content;
      if (Array.isArray(c)) {
        raw = c.flatMap((b) => {
          if (b.type === "text") return [b.text];
          if (b.type === "tool_use") return [toolUseSearchText(b.input)];
          return [];
        }).join("\n");
      }
      break;
    }
    case "attachment": {
      if (msg.attachment.type === "relevant_memories") {
        raw = msg.attachment.memories.map((m) => m.content).join("\n");
      } else if (
        // Mid-turn prompts — queued while an agent is running. Render via
        // UserTextMessage (AttachmentMessage.tsx:~348). stickyPromptText
        // (VirtualMessageList.tsx:~103) has the same guards — mirror here.
        msg.attachment.type === "queued_command" && msg.attachment.commandMode !== "task-notification" && !msg.attachment.isMeta
      ) {
        const p = msg.attachment.prompt;
        raw = typeof p === "string" ? p : p.flatMap((b) => b.type === "text" ? [b.text] : []).join("\n");
      }
      break;
    }
    case "collapsed_read_search": {
      if (msg.relevantMemories) {
        raw = msg.relevantMemories.map((m) => m.content).join("\n");
      }
      break;
    }
    default:
      break;
  }
  let t = raw;
  let open = t.indexOf("<system-reminder>");
  while (open >= 0) {
    const close = t.indexOf(SYSTEM_REMINDER_CLOSE, open);
    if (close < 0) break;
    t = t.slice(0, open) + t.slice(close + SYSTEM_REMINDER_CLOSE.length);
    open = t.indexOf("<system-reminder>");
  }
  return t;
}
function toolUseSearchText(input) {
  if (!input || typeof input !== "object") return "";
  const o = input;
  const parts = [];
  for (const k of [
    "command",
    "pattern",
    "file_path",
    "path",
    "prompt",
    "description",
    "query",
    "url",
    "skill"
    // SkillTool
  ]) {
    const v = o[k];
    if (typeof v === "string") parts.push(v);
  }
  for (const k of ["args", "files"]) {
    const v = o[k];
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      parts.push(v.join(" "));
    }
  }
  return parts.join("\n");
}
function toolResultSearchText(r) {
  if (!r || typeof r !== "object") return typeof r === "string" ? r : "";
  const o = r;
  if (typeof o.stdout === "string") {
    const err = typeof o.stderr === "string" ? o.stderr : "";
    return o.stdout + (err ? "\n" + err : "");
  }
  if (o.file && typeof o.file === "object" && typeof o.file.content === "string") {
    return o.file.content;
  }
  const parts = [];
  for (const k of ["content", "output", "result", "text", "message"]) {
    const v = o[k];
    if (typeof v === "string") parts.push(v);
  }
  for (const k of ["filenames", "lines", "results"]) {
    const v = o[k];
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      parts.push(v.join("\n"));
    }
  }
  return parts.join("\n");
}
export {
  renderableSearchText,
  toolResultSearchText,
  toolUseSearchText
};
