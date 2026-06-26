import { getFeatureValue_CACHED_MAY_BE_STALE } from "../services/analytics/growthbook.js";
import {
  countMessagesTokensWithAPI,
  roughTokenCountEstimation
} from "../services/tokenEstimation.js";
import { compressImageBlock } from "./imageResizer.js";
import { logError } from "./log.js";
const MCP_TOKEN_COUNT_THRESHOLD_FACTOR = 0.5;
const IMAGE_TOKEN_ESTIMATE = 1600;
const DEFAULT_MAX_MCP_OUTPUT_TOKENS = 25e3;
function getMaxMcpOutputTokens() {
  const envValue = process.env.MAX_MCP_OUTPUT_TOKENS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  const overrides = getFeatureValue_CACHED_MAY_BE_STALE("tengu_satin_quoll", {});
  const override = overrides?.["mcp_tool"];
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return override;
  }
  return DEFAULT_MAX_MCP_OUTPUT_TOKENS;
}
function isTextBlock(block) {
  return block.type === "text";
}
function isImageBlock(block) {
  return block.type === "image";
}
function getContentSizeEstimate(content) {
  if (!content) return 0;
  if (typeof content === "string") {
    return roughTokenCountEstimation(content);
  }
  return content.reduce((total, block) => {
    if (isTextBlock(block)) {
      return total + roughTokenCountEstimation(block.text);
    } else if (isImageBlock(block)) {
      return total + IMAGE_TOKEN_ESTIMATE;
    }
    return total;
  }, 0);
}
function getMaxMcpOutputChars() {
  return getMaxMcpOutputTokens() * 4;
}
function getTruncationMessage() {
  return `

[OUTPUT TRUNCATED - exceeded ${getMaxMcpOutputTokens()} token limit]

The tool output was truncated. If this MCP server provides pagination or filtering tools, use them to retrieve specific portions of the data. If pagination is not available, inform the user that you are working with truncated output and results may be incomplete.`;
}
function truncateString(content, maxChars) {
  if (content.length <= maxChars) {
    return content;
  }
  return content.slice(0, maxChars);
}
async function truncateContentBlocks(blocks, maxChars) {
  const result = [];
  let currentChars = 0;
  for (const block of blocks) {
    if (isTextBlock(block)) {
      const remainingChars = maxChars - currentChars;
      if (remainingChars <= 0) break;
      if (block.text.length <= remainingChars) {
        result.push(block);
        currentChars += block.text.length;
      } else {
        result.push({ type: "text", text: block.text.slice(0, remainingChars) });
        break;
      }
    } else if (isImageBlock(block)) {
      const imageChars = IMAGE_TOKEN_ESTIMATE * 4;
      if (currentChars + imageChars <= maxChars) {
        result.push(block);
        currentChars += imageChars;
      } else {
        const remainingChars = maxChars - currentChars;
        if (remainingChars > 0) {
          const remainingBytes = Math.floor(remainingChars * 0.75);
          try {
            const compressedBlock = await compressImageBlock(
              block,
              remainingBytes
            );
            result.push(compressedBlock);
            if (compressedBlock.source.type === "base64") {
              currentChars += compressedBlock.source.data.length;
            } else {
              currentChars += imageChars;
            }
          } catch {
          }
        }
      }
    } else {
      result.push(block);
    }
  }
  return result;
}
async function mcpContentNeedsTruncation(content) {
  if (!content) return false;
  const contentSizeEstimate = getContentSizeEstimate(content);
  if (contentSizeEstimate <= getMaxMcpOutputTokens() * MCP_TOKEN_COUNT_THRESHOLD_FACTOR) {
    return false;
  }
  try {
    const messages = typeof content === "string" ? [{ role: "user", content }] : [{ role: "user", content }];
    const tokenCount = await countMessagesTokensWithAPI(messages, []);
    return !!(tokenCount && tokenCount > getMaxMcpOutputTokens());
  } catch (error) {
    logError(error);
    return false;
  }
}
async function truncateMcpContent(content) {
  if (!content) return content;
  const maxChars = getMaxMcpOutputChars();
  const truncationMsg = getTruncationMessage();
  if (typeof content === "string") {
    return truncateString(content, maxChars) + truncationMsg;
  } else {
    const truncatedBlocks = await truncateContentBlocks(
      content,
      maxChars
    );
    truncatedBlocks.push({ type: "text", text: truncationMsg });
    return truncatedBlocks;
  }
}
async function truncateMcpContentIfNeeded(content) {
  if (!await mcpContentNeedsTruncation(content)) {
    return content;
  }
  return await truncateMcpContent(content);
}
export {
  IMAGE_TOKEN_ESTIMATE,
  MCP_TOKEN_COUNT_THRESHOLD_FACTOR,
  getContentSizeEstimate,
  getMaxMcpOutputTokens,
  mcpContentNeedsTruncation,
  truncateMcpContent,
  truncateMcpContentIfNeeded
};
