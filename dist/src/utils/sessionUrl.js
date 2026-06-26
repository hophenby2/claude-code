import { randomUUID } from "crypto";
import { validateUuid } from "./uuid.js";
function parseSessionIdentifier(resumeIdentifier) {
  if (resumeIdentifier.toLowerCase().endsWith(".jsonl")) {
    return {
      sessionId: randomUUID(),
      ingressUrl: null,
      isUrl: false,
      jsonlFile: resumeIdentifier,
      isJsonlFile: true
    };
  }
  if (validateUuid(resumeIdentifier)) {
    return {
      sessionId: resumeIdentifier,
      ingressUrl: null,
      isUrl: false,
      jsonlFile: null,
      isJsonlFile: false
    };
  }
  try {
    const url = new URL(resumeIdentifier);
    return {
      sessionId: randomUUID(),
      ingressUrl: url.href,
      isUrl: true,
      jsonlFile: null,
      isJsonlFile: false
    };
  } catch {
  }
  return null;
}
export {
  parseSessionIdentifier
};
