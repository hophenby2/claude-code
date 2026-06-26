import axios from "axios";
import { createCombinedAbortSignal } from "../combinedAbortSignal.js";
import { logForDebugging } from "../debug.js";
import { errorMessage } from "../errors.js";
import { getProxyUrl, shouldBypassProxy } from "../proxy.js";
import * as settingsModule from "../settings/settings.js";
import { ssrfGuardedLookup } from "./ssrfGuard.js";
const DEFAULT_HTTP_HOOK_TIMEOUT_MS = 10 * 60 * 1e3;
async function getSandboxProxyConfig() {
  const { SandboxManager } = await import("../sandbox/sandbox-adapter.js");
  if (!SandboxManager.isSandboxingEnabled()) {
    return void 0;
  }
  await SandboxManager.waitForNetworkInitialization();
  const proxyPort = SandboxManager.getProxyPort();
  if (!proxyPort) {
    return void 0;
  }
  return { host: "127.0.0.1", port: proxyPort, protocol: "http" };
}
function getHttpHookPolicy() {
  const settings = settingsModule.getInitialSettings();
  return {
    allowedUrls: settings.allowedHttpHookUrls,
    allowedEnvVars: settings.httpHookAllowedEnvVars
  };
}
function urlMatchesPattern(url, pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regexStr = escaped.replace(/\*/g, ".*");
  return new RegExp(`^${regexStr}$`).test(url);
}
function sanitizeHeaderValue(value) {
  return value.replace(/[\r\n\x00]/g, "");
}
function interpolateEnvVars(value, allowedEnvVars) {
  const interpolated = value.replace(
    /\$\{([A-Z_][A-Z0-9_]*)\}|\$([A-Z_][A-Z0-9_]*)/g,
    (_, braced, unbraced) => {
      const varName = braced ?? unbraced;
      if (!allowedEnvVars.has(varName)) {
        logForDebugging(
          `Hooks: env var $${varName} not in allowedEnvVars, skipping interpolation`,
          { level: "warn" }
        );
        return "";
      }
      return process.env[varName] ?? "";
    }
  );
  return sanitizeHeaderValue(interpolated);
}
async function execHttpHook(hook, _hookEvent, jsonInput, signal) {
  const policy = getHttpHookPolicy();
  if (policy.allowedUrls !== void 0) {
    const matched = policy.allowedUrls.some((p) => urlMatchesPattern(hook.url, p));
    if (!matched) {
      const msg = `HTTP hook blocked: ${hook.url} does not match any pattern in allowedHttpHookUrls`;
      logForDebugging(msg, { level: "warn" });
      return { ok: false, body: "", error: msg };
    }
  }
  const timeoutMs = hook.timeout ? hook.timeout * 1e3 : DEFAULT_HTTP_HOOK_TIMEOUT_MS;
  const { signal: combinedSignal, cleanup } = createCombinedAbortSignal(
    signal,
    { timeoutMs }
  );
  try {
    const headers = {
      "Content-Type": "application/json"
    };
    if (hook.headers) {
      const hookVars = hook.allowedEnvVars ?? [];
      const effectiveVars = policy.allowedEnvVars !== void 0 ? hookVars.filter((v) => policy.allowedEnvVars.includes(v)) : hookVars;
      const allowedEnvVars = new Set(effectiveVars);
      for (const [name, value] of Object.entries(hook.headers)) {
        headers[name] = interpolateEnvVars(value, allowedEnvVars);
      }
    }
    const sandboxProxy = await getSandboxProxyConfig();
    const envProxyActive = !sandboxProxy && getProxyUrl() !== void 0 && !shouldBypassProxy(hook.url);
    if (sandboxProxy) {
      logForDebugging(
        `Hooks: HTTP hook POST to ${hook.url} (via sandbox proxy :${sandboxProxy.port})`
      );
    } else if (envProxyActive) {
      logForDebugging(
        `Hooks: HTTP hook POST to ${hook.url} (via env-var proxy)`
      );
    } else {
      logForDebugging(`Hooks: HTTP hook POST to ${hook.url}`);
    }
    const response = await axios.post(hook.url, jsonInput, {
      headers,
      signal: combinedSignal,
      responseType: "text",
      validateStatus: () => true,
      maxRedirects: 0,
      // Explicit false prevents axios's own env-var proxy detection; when an
      // env-var proxy is configured, the global axios interceptor installed
      // by configureGlobalAgents() handles it via httpsAgent instead.
      proxy: sandboxProxy ?? false,
      // SSRF guard: validate resolved IPs, block private/link-local ranges
      // (but allow loopback for local dev). Skipped when any proxy is in
      // use — the proxy performs DNS for the target, and applying the
      // guard would instead validate the proxy's own IP, breaking
      // connections to corporate proxies on private networks.
      lookup: sandboxProxy || envProxyActive ? void 0 : ssrfGuardedLookup
    });
    cleanup();
    const body = response.data ?? "";
    logForDebugging(
      `Hooks: HTTP hook response status ${response.status}, body length ${body.length}`
    );
    return {
      ok: response.status >= 200 && response.status < 300,
      statusCode: response.status,
      body
    };
  } catch (error) {
    cleanup();
    if (combinedSignal.aborted) {
      return { ok: false, body: "", aborted: true };
    }
    const errorMsg = errorMessage(error);
    logForDebugging(`Hooks: HTTP hook error: ${errorMsg}`, { level: "error" });
    return { ok: false, body: "", error: errorMsg };
  }
}
export {
  execHttpHook
};
