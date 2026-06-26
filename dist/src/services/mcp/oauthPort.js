import { createServer } from "http";
import { getPlatform } from "../../utils/platform.js";
const REDIRECT_PORT_RANGE = getPlatform() === "windows" ? { min: 39152, max: 49151 } : { min: 49152, max: 65535 };
const REDIRECT_PORT_FALLBACK = 3118;
function buildRedirectUri(port = REDIRECT_PORT_FALLBACK) {
  return `http://localhost:${port}/callback`;
}
function getMcpOAuthCallbackPort() {
  const port = parseInt(process.env.MCP_OAUTH_CALLBACK_PORT || "", 10);
  return port > 0 ? port : void 0;
}
async function findAvailablePort() {
  const configuredPort = getMcpOAuthCallbackPort();
  if (configuredPort) {
    return configuredPort;
  }
  const { min, max } = REDIRECT_PORT_RANGE;
  const range = max - min + 1;
  const maxAttempts = Math.min(range, 100);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = min + Math.floor(Math.random() * range);
    try {
      await new Promise((resolve, reject) => {
        const testServer = createServer();
        testServer.once("error", reject);
        testServer.listen(port, () => {
          testServer.close(() => resolve());
        });
      });
      return port;
    } catch {
      continue;
    }
  }
  try {
    await new Promise((resolve, reject) => {
      const testServer = createServer();
      testServer.once("error", reject);
      testServer.listen(REDIRECT_PORT_FALLBACK, () => {
        testServer.close(() => resolve());
      });
    });
    return REDIRECT_PORT_FALLBACK;
  } catch {
    throw new Error(`No available ports for OAuth redirect`);
  }
}
export {
  buildRedirectUri,
  findAvailablePort
};
