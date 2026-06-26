import { createServer } from "http";
import { logEvent } from "../analytics/index.js";
import { getOauthConfig } from "../../constants/oauth.js";
import { logError } from "../../utils/log.js";
import { shouldUseClaudeAIAuth } from "./client.js";
class AuthCodeListener {
  localServer;
  port = 0;
  promiseResolver = null;
  promiseRejecter = null;
  expectedState = null;
  // State parameter for CSRF protection
  pendingResponse = null;
  // Response object for final redirect
  callbackPath;
  // Configurable callback path
  constructor(callbackPath = "/callback") {
    this.localServer = createServer();
    this.callbackPath = callbackPath;
  }
  /**
   * Starts listening on an OS-assigned port and returns the port number.
   * This avoids race conditions by keeping the server open until it's used.
   * @param port Optional specific port to use. If not provided, uses OS-assigned port.
   */
  async start(port) {
    return new Promise((resolve, reject) => {
      this.localServer.once("error", (err) => {
        reject(
          new Error(`Failed to start OAuth callback server: ${err.message}`)
        );
      });
      this.localServer.listen(port ?? 0, "localhost", () => {
        const address = this.localServer.address();
        this.port = address.port;
        resolve(this.port);
      });
    });
  }
  getPort() {
    return this.port;
  }
  hasPendingResponse() {
    return this.pendingResponse !== null;
  }
  async waitForAuthorization(state, onReady) {
    return new Promise((resolve, reject) => {
      this.promiseResolver = resolve;
      this.promiseRejecter = reject;
      this.expectedState = state;
      this.startLocalListener(onReady);
    });
  }
  /**
   * Completes the OAuth flow by redirecting the user's browser to a success page.
   * Different success pages are shown based on the granted scopes.
   * @param scopes The OAuth scopes that were granted
   * @param customHandler Optional custom handler to serve response instead of redirecting
   */
  handleSuccessRedirect(scopes, customHandler) {
    if (!this.pendingResponse) return;
    if (customHandler) {
      customHandler(this.pendingResponse, scopes);
      this.pendingResponse = null;
      logEvent("tengu_oauth_automatic_redirect", { custom_handler: true });
      return;
    }
    const successUrl = shouldUseClaudeAIAuth(scopes) ? getOauthConfig().CLAUDEAI_SUCCESS_URL : getOauthConfig().CONSOLE_SUCCESS_URL;
    this.pendingResponse.writeHead(302, { Location: successUrl });
    this.pendingResponse.end();
    this.pendingResponse = null;
    logEvent("tengu_oauth_automatic_redirect", {});
  }
  /**
   * Handles error case by sending a redirect to the appropriate success page with an error indicator,
   * ensuring the browser flow is completed properly.
   */
  handleErrorRedirect() {
    if (!this.pendingResponse) return;
    const errorUrl = getOauthConfig().CLAUDEAI_SUCCESS_URL;
    this.pendingResponse.writeHead(302, { Location: errorUrl });
    this.pendingResponse.end();
    this.pendingResponse = null;
    logEvent("tengu_oauth_automatic_redirect_error", {});
  }
  startLocalListener(onReady) {
    this.localServer.on("request", this.handleRedirect.bind(this));
    this.localServer.on("error", this.handleError.bind(this));
    void onReady();
  }
  handleRedirect(req, res) {
    const parsedUrl = new URL(
      req.url || "",
      `http://${req.headers.host || "localhost"}`
    );
    if (parsedUrl.pathname !== this.callbackPath) {
      res.writeHead(404);
      res.end();
      return;
    }
    const authCode = parsedUrl.searchParams.get("code") ?? void 0;
    const state = parsedUrl.searchParams.get("state") ?? void 0;
    this.validateAndRespond(authCode, state, res);
  }
  validateAndRespond(authCode, state, res) {
    if (!authCode) {
      res.writeHead(400);
      res.end("Authorization code not found");
      this.reject(new Error("No authorization code received"));
      return;
    }
    if (state !== this.expectedState) {
      res.writeHead(400);
      res.end("Invalid state parameter");
      this.reject(new Error("Invalid state parameter"));
      return;
    }
    this.pendingResponse = res;
    this.resolve(authCode);
  }
  handleError(err) {
    logError(err);
    this.close();
    this.reject(err);
  }
  resolve(authorizationCode) {
    if (this.promiseResolver) {
      this.promiseResolver(authorizationCode);
      this.promiseResolver = null;
      this.promiseRejecter = null;
    }
  }
  reject(error) {
    if (this.promiseRejecter) {
      this.promiseRejecter(error);
      this.promiseResolver = null;
      this.promiseRejecter = null;
    }
  }
  close() {
    if (this.pendingResponse) {
      this.handleErrorRedirect();
    }
    if (this.localServer) {
      this.localServer.removeAllListeners();
      this.localServer.close();
    }
  }
}
export {
  AuthCodeListener
};
