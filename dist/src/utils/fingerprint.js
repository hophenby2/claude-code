import { createHash } from "crypto";
const FINGERPRINT_SALT = "59cf53e54c78";
function extractFirstMessageText(messages) {
  const firstUserMessage = messages.find((msg) => msg.type === "user");
  if (!firstUserMessage) {
    return "";
  }
  const content = firstUserMessage.message.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const textBlock = content.find((block) => block.type === "text");
    if (textBlock && textBlock.type === "text") {
      return textBlock.text;
    }
  }
  return "";
}
function computeFingerprint(messageText, version) {
  const indices = [4, 7, 20];
  const chars = indices.map((i) => messageText[i] || "0").join("");
  const fingerprintInput = `${FINGERPRINT_SALT}${chars}${version}`;
  const hash = createHash("sha256").update(fingerprintInput).digest("hex");
  return hash.slice(0, 3);
}
function computeFingerprintFromMessages(messages) {
  const firstMessageText = extractFirstMessageText(messages);
  return computeFingerprint(firstMessageText, "0.0.0-dev");
}
export {
  FINGERPRINT_SALT,
  computeFingerprint,
  computeFingerprintFromMessages,
  extractFirstMessageText
};
