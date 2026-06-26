const GROUPING_CACHE = /* @__PURE__ */ new WeakMap();
function getToolsWithGrouping(tools) {
  let cached = GROUPING_CACHE.get(tools);
  if (!cached) {
    cached = new Set(tools.filter((t) => t.renderGroupedToolUse).map((t) => t.name));
    GROUPING_CACHE.set(tools, cached);
  }
  return cached;
}
function getToolUseInfo(msg) {
  if (msg.type === "assistant" && msg.message.content[0]?.type === "tool_use") {
    const content = msg.message.content[0];
    return {
      messageId: msg.message.id,
      toolUseId: content.id,
      toolName: content.name
    };
  }
  return null;
}
function applyGrouping(messages, tools, verbose = false) {
  if (verbose) {
    return {
      messages
    };
  }
  const toolsWithGrouping = getToolsWithGrouping(tools);
  const groups = /* @__PURE__ */ new Map();
  for (const msg of messages) {
    const info = getToolUseInfo(msg);
    if (info && toolsWithGrouping.has(info.toolName)) {
      const key = `${info.messageId}:${info.toolName}`;
      const group = groups.get(key) ?? [];
      group.push(msg);
      groups.set(key, group);
    }
  }
  const validGroups = /* @__PURE__ */ new Map();
  const groupedToolUseIds = /* @__PURE__ */ new Set();
  for (const [key, group] of groups) {
    if (group.length >= 2) {
      validGroups.set(key, group);
      for (const msg of group) {
        const info = getToolUseInfo(msg);
        if (info) {
          groupedToolUseIds.add(info.toolUseId);
        }
      }
    }
  }
  const resultsByToolUseId = /* @__PURE__ */ new Map();
  for (const msg of messages) {
    if (msg.type === "user") {
      for (const content of msg.message.content) {
        if (content.type === "tool_result" && groupedToolUseIds.has(content.tool_use_id)) {
          resultsByToolUseId.set(content.tool_use_id, msg);
        }
      }
    }
  }
  const result = [];
  const emittedGroups = /* @__PURE__ */ new Set();
  for (const msg of messages) {
    const info = getToolUseInfo(msg);
    if (info) {
      const key = `${info.messageId}:${info.toolName}`;
      const group = validGroups.get(key);
      if (group) {
        if (!emittedGroups.has(key)) {
          emittedGroups.add(key);
          const firstMsg = group[0];
          const results = [];
          for (const assistantMsg of group) {
            const toolUseId = assistantMsg.message.content[0].id;
            const resultMsg = resultsByToolUseId.get(toolUseId);
            if (resultMsg) {
              results.push(resultMsg);
            }
          }
          const groupedMessage = {
            type: "grouped_tool_use",
            toolName: info.toolName,
            messages: group,
            results,
            displayMessage: firstMsg,
            uuid: `grouped-${firstMsg.uuid}`,
            timestamp: firstMsg.timestamp,
            messageId: info.messageId
          };
          result.push(groupedMessage);
        }
        continue;
      }
    }
    if (msg.type === "user") {
      const toolResults = msg.message.content.filter(
        (c) => c.type === "tool_result"
      );
      if (toolResults.length > 0) {
        const allGrouped = toolResults.every(
          (tr) => groupedToolUseIds.has(tr.tool_use_id)
        );
        if (allGrouped) {
          continue;
        }
      }
    }
    result.push(msg);
  }
  return { messages: result };
}
export {
  applyGrouping
};
