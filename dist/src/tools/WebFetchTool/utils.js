import axios from "axios";
import { LRUCache } from "lru-cache";
import {
  logEvent
} from "../../services/analytics/index.js";
import { queryHaiku } from "../../services/api/claude.js";
import { AbortError } from "../../utils/errors.js";
import { getWebFetchUserAgent } from "../../utils/http.js";
import { logError } from "../../utils/log.js";
import {
  isBinaryContentType,
  persistBinaryContent
} from "../../utils/mcpOutputStorage.js";
import { getSettings_DEPRECATED } from "../../utils/settings/settings.js";
import { asSystemPrompt } from "../../utils/systemPromptType.js";
import { isPreapprovedHost } from "./preapproved.js";
import { makeSecondaryModelPrompt } from "./prompt.js";
class DomainBlockedError extends Error {
  constructor(domain) {
    super(`Claude Code is unable to fetch from ${domain}`);
    this.name = "DomainBlockedError";
  }
}
class DomainCheckFailedError extends Error {
  constructor(domain) {
    super(
      `Unable to verify if domain ${domain} is safe to fetch. This may be due to network restrictions or enterprise security policies blocking claude.ai.`
    );
    this.name = "DomainCheckFailedError";
  }
}
class EgressBlockedError extends Error {
  constructor(domain) {
    super(
      JSON.stringify({
        error_type: "EGRESS_BLOCKED",
        domain,
        message: `Access to ${domain} is blocked by the network egress proxy.`
      })
    );
    this.domain = domain;
    this.name = "EgressBlockedError";
  }
  domain;
}
const CACHE_TTL_MS = 15 * 60 * 1e3;
const MAX_CACHE_SIZE_BYTES = 50 * 1024 * 1024;
const URL_CACHE = new LRUCache({
  maxSize: MAX_CACHE_SIZE_BYTES,
  ttl: CACHE_TTL_MS
});
const DOMAIN_CHECK_CACHE = new LRUCache({
  max: 128,
  ttl: 5 * 60 * 1e3
  // 5 minutes — shorter than URL_CACHE TTL
});
function clearWebFetchCache() {
  URL_CACHE.clear();
  DOMAIN_CHECK_CACHE.clear();
}
let turndownServicePromise;
function getTurndownService() {
  return turndownServicePromise ??= import("turndown").then((m) => {
    const Turndown = m.default;
    return new Turndown();
  });
}
const MAX_URL_LENGTH = 2e3;
const MAX_HTTP_CONTENT_LENGTH = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 6e4;
const DOMAIN_CHECK_TIMEOUT_MS = 1e4;
const MAX_REDIRECTS = 10;
const MAX_MARKDOWN_LENGTH = 1e5;
function isPreapprovedUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return isPreapprovedHost(parsedUrl.hostname, parsedUrl.pathname);
  } catch {
    return false;
  }
}
function validateURL(url) {
  if (url.length > MAX_URL_LENGTH) {
    return false;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password) {
    return false;
  }
  const hostname = parsed.hostname;
  const parts = hostname.split(".");
  if (parts.length < 2) {
    return false;
  }
  return true;
}
async function checkDomainBlocklist(domain) {
  if (DOMAIN_CHECK_CACHE.has(domain)) {
    return { status: "allowed" };
  }
  try {
    const response = await axios.get(
      `https://api.anthropic.com/api/web/domain_info?domain=${encodeURIComponent(domain)}`,
      { timeout: DOMAIN_CHECK_TIMEOUT_MS }
    );
    if (response.status === 200) {
      if (response.data.can_fetch === true) {
        DOMAIN_CHECK_CACHE.set(domain, true);
        return { status: "allowed" };
      }
      return { status: "blocked" };
    }
    return {
      status: "check_failed",
      error: new Error(`Domain check returned status ${response.status}`)
    };
  } catch (e) {
    logError(e);
    return { status: "check_failed", error: e };
  }
}
function isPermittedRedirect(originalUrl, redirectUrl) {
  try {
    const parsedOriginal = new URL(originalUrl);
    const parsedRedirect = new URL(redirectUrl);
    if (parsedRedirect.protocol !== parsedOriginal.protocol) {
      return false;
    }
    if (parsedRedirect.port !== parsedOriginal.port) {
      return false;
    }
    if (parsedRedirect.username || parsedRedirect.password) {
      return false;
    }
    const stripWww = (hostname) => hostname.replace(/^www\./, "");
    const originalHostWithoutWww = stripWww(parsedOriginal.hostname);
    const redirectHostWithoutWww = stripWww(parsedRedirect.hostname);
    return originalHostWithoutWww === redirectHostWithoutWww;
  } catch (_error) {
    return false;
  }
}
async function getWithPermittedRedirects(url, signal, redirectChecker, depth = 0) {
  if (depth > MAX_REDIRECTS) {
    throw new Error(`Too many redirects (exceeded ${MAX_REDIRECTS})`);
  }
  try {
    return await axios.get(url, {
      signal,
      timeout: FETCH_TIMEOUT_MS,
      maxRedirects: 0,
      responseType: "arraybuffer",
      maxContentLength: MAX_HTTP_CONTENT_LENGTH,
      headers: {
        Accept: "text/markdown, text/html, */*",
        "User-Agent": getWebFetchUserAgent()
      }
    });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response && [301, 302, 307, 308].includes(error.response.status)) {
      const redirectLocation = error.response.headers.location;
      if (!redirectLocation) {
        throw new Error("Redirect missing Location header");
      }
      const redirectUrl = new URL(redirectLocation, url).toString();
      if (redirectChecker(url, redirectUrl)) {
        return getWithPermittedRedirects(
          redirectUrl,
          signal,
          redirectChecker,
          depth + 1
        );
      } else {
        return {
          type: "redirect",
          originalUrl: url,
          redirectUrl,
          statusCode: error.response.status
        };
      }
    }
    if (axios.isAxiosError(error) && error.response?.status === 403 && error.response.headers["x-proxy-error"] === "blocked-by-allowlist") {
      const hostname = new URL(url).hostname;
      throw new EgressBlockedError(hostname);
    }
    throw error;
  }
}
function isRedirectInfo(response) {
  return "type" in response && response.type === "redirect";
}
async function getURLMarkdownContent(url, abortController) {
  if (!validateURL(url)) {
    throw new Error("Invalid URL");
  }
  const cachedEntry = URL_CACHE.get(url);
  if (cachedEntry) {
    return {
      bytes: cachedEntry.bytes,
      code: cachedEntry.code,
      codeText: cachedEntry.codeText,
      content: cachedEntry.content,
      contentType: cachedEntry.contentType,
      persistedPath: cachedEntry.persistedPath,
      persistedSize: cachedEntry.persistedSize
    };
  }
  let parsedUrl;
  let upgradedUrl = url;
  try {
    parsedUrl = new URL(url);
    if (parsedUrl.protocol === "http:") {
      parsedUrl.protocol = "https:";
      upgradedUrl = parsedUrl.toString();
    }
    const hostname = parsedUrl.hostname;
    const settings = getSettings_DEPRECATED();
    if (!settings.skipWebFetchPreflight) {
      const checkResult = await checkDomainBlocklist(hostname);
      switch (checkResult.status) {
        case "allowed":
          break;
        case "blocked":
          throw new DomainBlockedError(hostname);
        case "check_failed":
          throw new DomainCheckFailedError(hostname);
      }
    }
    if (process.env.USER_TYPE === "ant") {
      logEvent("tengu_web_fetch_host", {
        hostname
      });
    }
  } catch (e) {
    if (e instanceof DomainBlockedError || e instanceof DomainCheckFailedError) {
      throw e;
    }
    logError(e);
  }
  const response = await getWithPermittedRedirects(
    upgradedUrl,
    abortController.signal,
    isPermittedRedirect
  );
  if (isRedirectInfo(response)) {
    return response;
  }
  const rawBuffer = Buffer.from(response.data);
  response.data = null;
  const contentType = response.headers["content-type"] ?? "";
  let persistedPath;
  let persistedSize;
  if (isBinaryContentType(contentType)) {
    const persistId = `webfetch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await persistBinaryContent(rawBuffer, contentType, persistId);
    if (!("error" in result)) {
      persistedPath = result.filepath;
      persistedSize = result.size;
    }
  }
  const bytes = rawBuffer.length;
  const htmlContent = rawBuffer.toString("utf-8");
  let markdownContent;
  let contentBytes;
  if (contentType.includes("text/html")) {
    markdownContent = (await getTurndownService()).turndown(htmlContent);
    contentBytes = Buffer.byteLength(markdownContent);
  } else {
    markdownContent = htmlContent;
    contentBytes = bytes;
  }
  const entry = {
    bytes,
    code: response.status,
    codeText: response.statusText,
    content: markdownContent,
    contentType,
    persistedPath,
    persistedSize
  };
  URL_CACHE.set(url, entry, { size: Math.max(1, contentBytes) });
  return entry;
}
async function applyPromptToMarkdown(prompt, markdownContent, signal, isNonInteractiveSession, isPreapprovedDomain) {
  const truncatedContent = markdownContent.length > MAX_MARKDOWN_LENGTH ? markdownContent.slice(0, MAX_MARKDOWN_LENGTH) + "\n\n[Content truncated due to length...]" : markdownContent;
  const modelPrompt = makeSecondaryModelPrompt(
    truncatedContent,
    prompt,
    isPreapprovedDomain
  );
  const assistantMessage = await queryHaiku({
    systemPrompt: asSystemPrompt([]),
    userPrompt: modelPrompt,
    signal,
    options: {
      querySource: "web_fetch_apply",
      agents: [],
      isNonInteractiveSession,
      hasAppendSystemPrompt: false,
      mcpTools: []
    }
  });
  if (signal.aborted) {
    throw new AbortError();
  }
  const { content } = assistantMessage.message;
  if (content.length > 0) {
    const contentBlock = content[0];
    if ("text" in contentBlock) {
      return contentBlock.text;
    }
  }
  return "No response from model";
}
export {
  MAX_MARKDOWN_LENGTH,
  applyPromptToMarkdown,
  checkDomainBlocklist,
  clearWebFetchCache,
  getURLMarkdownContent,
  getWithPermittedRedirects,
  isPermittedRedirect,
  isPreapprovedUrl,
  validateURL
};
