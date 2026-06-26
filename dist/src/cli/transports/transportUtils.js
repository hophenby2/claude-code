import { URL } from "url";
import { isEnvTruthy } from "../../utils/envUtils.js";
import { HybridTransport } from "./HybridTransport.js";
import { SSETransport } from "./SSETransport.js";
import { WebSocketTransport } from "./WebSocketTransport.js";
function getTransportForUrl(url, headers = {}, sessionId, refreshHeaders) {
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_CCR_V2)) {
    const sseUrl = new URL(url.href);
    if (sseUrl.protocol === "wss:") {
      sseUrl.protocol = "https:";
    } else if (sseUrl.protocol === "ws:") {
      sseUrl.protocol = "http:";
    }
    sseUrl.pathname = sseUrl.pathname.replace(/\/$/, "") + "/worker/events/stream";
    return new SSETransport(sseUrl, headers, sessionId, refreshHeaders);
  }
  if (url.protocol === "ws:" || url.protocol === "wss:") {
    if (isEnvTruthy(process.env.CLAUDE_CODE_POST_FOR_SESSION_INGRESS_V2)) {
      return new HybridTransport(url, headers, sessionId, refreshHeaders);
    }
    return new WebSocketTransport(url, headers, sessionId, refreshHeaders);
  } else {
    throw new Error(`Unsupported protocol: ${url.protocol}`);
  }
}
export {
  getTransportForUrl
};
