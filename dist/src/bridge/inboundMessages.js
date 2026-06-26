import { detectImageFormatFromBase64 } from "../utils/imageResizer.js";
function extractInboundMessageFields(msg) {
  if (msg.type !== "user") return void 0;
  const content = msg.message?.content;
  if (!content) return void 0;
  if (Array.isArray(content) && content.length === 0) return void 0;
  const uuid = "uuid" in msg && typeof msg.uuid === "string" ? msg.uuid : void 0;
  return {
    content: Array.isArray(content) ? normalizeImageBlocks(content) : content,
    uuid
  };
}
function normalizeImageBlocks(blocks) {
  if (!blocks.some(isMalformedBase64Image)) return blocks;
  return blocks.map((block) => {
    if (!isMalformedBase64Image(block)) return block;
    const src = block.source;
    const mediaType = typeof src.mediaType === "string" && src.mediaType ? src.mediaType : detectImageFormatFromBase64(block.source.data);
    return {
      ...block,
      source: {
        type: "base64",
        media_type: mediaType,
        data: block.source.data
      }
    };
  });
}
function isMalformedBase64Image(block) {
  if (block.type !== "image" || block.source?.type !== "base64") return false;
  return !block.source.media_type;
}
export {
  extractInboundMessageFields,
  normalizeImageBlocks
};
