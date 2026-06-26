import { API_IMAGE_MAX_BASE64_SIZE } from "../constants/apiLimits.js";
import { logEvent } from "../services/analytics/index.js";
import { formatFileSize } from "./format.js";
class ImageSizeError extends Error {
  constructor(oversizedImages, maxSize) {
    let message;
    const firstImage = oversizedImages[0];
    if (oversizedImages.length === 1 && firstImage) {
      message = `Image base64 size (${formatFileSize(firstImage.size)}) exceeds API limit (${formatFileSize(maxSize)}). Please resize the image before sending.`;
    } else {
      message = `${oversizedImages.length} images exceed the API limit (${formatFileSize(maxSize)}): ` + oversizedImages.map((img) => `Image ${img.index}: ${formatFileSize(img.size)}`).join(", ") + `. Please resize these images before sending.`;
    }
    super(message);
    this.name = "ImageSizeError";
  }
}
function isBase64ImageBlock(block) {
  if (typeof block !== "object" || block === null) return false;
  const b = block;
  if (b.type !== "image") return false;
  if (typeof b.source !== "object" || b.source === null) return false;
  const source = b.source;
  return source.type === "base64" && typeof source.data === "string";
}
function validateImagesForAPI(messages) {
  const oversizedImages = [];
  let imageIndex = 0;
  for (const msg of messages) {
    if (typeof msg !== "object" || msg === null) continue;
    const m = msg;
    if (m.type !== "user") continue;
    const innerMessage = m.message;
    if (!innerMessage) continue;
    const content = innerMessage.content;
    if (typeof content === "string" || !Array.isArray(content)) continue;
    for (const block of content) {
      if (isBase64ImageBlock(block)) {
        imageIndex++;
        const base64Size = block.source.data.length;
        if (base64Size > API_IMAGE_MAX_BASE64_SIZE) {
          logEvent("tengu_image_api_validation_failed", {
            base64_size_bytes: base64Size,
            max_bytes: API_IMAGE_MAX_BASE64_SIZE
          });
          oversizedImages.push({ index: imageIndex, size: base64Size });
        }
      }
    }
  }
  if (oversizedImages.length > 0) {
    throw new ImageSizeError(oversizedImages, API_IMAGE_MAX_BASE64_SIZE);
  }
}
export {
  ImageSizeError,
  validateImagesForAPI
};
