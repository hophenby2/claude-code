import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import memoize from "lodash-es/memoize.js";
import { getCACertificates } from "./caCerts.js";
import { logForDebugging } from "./debug.js";
import { isEnvTruthy } from "./envUtils.js";
import {
  getMTLSAgent,
  getMTLSConfig,
  getTLSFetchOptions
} from "./mtls.js";
let keepAliveDisabled = false;
function disableKeepAlive() {
  keepAliveDisabled = true;
}
function _resetKeepAliveForTesting() {
  keepAliveDisabled = false;
}
function getAddressFamily(options) {
  switch (options.family) {
    case 0:
    case 4:
    case 6:
      return options.family;
    case "IPv6":
      return 6;
    case "IPv4":
    case void 0:
      return 4;
    default:
      throw new Error(`Unsupported address family: ${options.family}`);
  }
}
function getProxyUrl(env = process.env) {
  return env.https_proxy || env.HTTPS_PROXY || env.http_proxy || env.HTTP_PROXY;
}
function getNoProxy(env = process.env) {
  return env.no_proxy || env.NO_PROXY;
}
function shouldBypassProxy(urlString, noProxy = getNoProxy()) {
  if (!noProxy) return false;
  if (noProxy === "*") return true;
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    const hostWithPort = `${hostname}:${port}`;
    const noProxyList = noProxy.split(/[,\s]+/).filter(Boolean);
    return noProxyList.some((pattern) => {
      pattern = pattern.toLowerCase().trim();
      if (pattern.includes(":")) {
        return hostWithPort === pattern;
      }
      if (pattern.startsWith(".")) {
        const suffix = pattern;
        return hostname === pattern.substring(1) || hostname.endsWith(suffix);
      }
      return hostname === pattern;
    });
  } catch {
    return false;
  }
}
function createHttpsProxyAgent(proxyUrl, extra = {}) {
  const mtlsConfig = getMTLSConfig();
  const caCerts = getCACertificates();
  const agentOptions = {
    ...mtlsConfig && {
      cert: mtlsConfig.cert,
      key: mtlsConfig.key,
      passphrase: mtlsConfig.passphrase
    },
    ...caCerts && { ca: caCerts }
  };
  if (isEnvTruthy(process.env.CLAUDE_CODE_PROXY_RESOLVES_HOSTS)) {
    agentOptions.lookup = (hostname, options, callback) => {
      callback(null, hostname, getAddressFamily(options));
    };
  }
  return new HttpsProxyAgent(proxyUrl, { ...agentOptions, ...extra });
}
function createAxiosInstance(extra = {}) {
  const proxyUrl = getProxyUrl();
  const mtlsAgent = getMTLSAgent();
  const instance = axios.create({ proxy: false });
  if (!proxyUrl) {
    if (mtlsAgent) instance.defaults.httpsAgent = mtlsAgent;
    return instance;
  }
  const proxyAgent = createHttpsProxyAgent(proxyUrl, extra);
  instance.interceptors.request.use((config) => {
    if (config.url && shouldBypassProxy(config.url)) {
      config.httpsAgent = mtlsAgent;
      config.httpAgent = mtlsAgent;
    } else {
      config.httpsAgent = proxyAgent;
      config.httpAgent = proxyAgent;
    }
    return config;
  });
  return instance;
}
const getProxyAgent = memoize((uri) => {
  const undiciMod = require("undici");
  const mtlsConfig = getMTLSConfig();
  const caCerts = getCACertificates();
  const proxyOptions = {
    // Override both HTTP and HTTPS proxy with the provided URI
    httpProxy: uri,
    httpsProxy: uri,
    noProxy: process.env.NO_PROXY || process.env.no_proxy
  };
  if (mtlsConfig || caCerts) {
    const tlsOpts = {
      ...mtlsConfig && {
        cert: mtlsConfig.cert,
        key: mtlsConfig.key,
        passphrase: mtlsConfig.passphrase
      },
      ...caCerts && { ca: caCerts }
    };
    proxyOptions.connect = tlsOpts;
    proxyOptions.requestTls = tlsOpts;
  }
  return new undiciMod.EnvHttpProxyAgent(proxyOptions);
});
function getWebSocketProxyAgent(url) {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) {
    return void 0;
  }
  if (shouldBypassProxy(url)) {
    return void 0;
  }
  return createHttpsProxyAgent(proxyUrl);
}
function getWebSocketProxyUrl(url) {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) {
    return void 0;
  }
  if (shouldBypassProxy(url)) {
    return void 0;
  }
  return proxyUrl;
}
function getProxyFetchOptions(opts) {
  const base = keepAliveDisabled ? { keepalive: false } : {};
  if (opts?.forAnthropicAPI) {
    const unixSocket = process.env.ANTHROPIC_UNIX_SOCKET;
    if (unixSocket && typeof Bun !== "undefined") {
      return { ...base, unix: unixSocket };
    }
  }
  const proxyUrl = getProxyUrl();
  if (proxyUrl) {
    if (typeof Bun !== "undefined") {
      return { ...base, proxy: proxyUrl, ...getTLSFetchOptions() };
    }
    return { ...base, dispatcher: getProxyAgent(proxyUrl) };
  }
  return { ...base, ...getTLSFetchOptions() };
}
let proxyInterceptorId;
function configureGlobalAgents() {
  const proxyUrl = getProxyUrl();
  const mtlsAgent = getMTLSAgent();
  if (proxyInterceptorId !== void 0) {
    axios.interceptors.request.eject(proxyInterceptorId);
    proxyInterceptorId = void 0;
  }
  axios.defaults.proxy = void 0;
  axios.defaults.httpAgent = void 0;
  axios.defaults.httpsAgent = void 0;
  if (proxyUrl) {
    axios.defaults.proxy = false;
    const proxyAgent = createHttpsProxyAgent(proxyUrl);
    proxyInterceptorId = axios.interceptors.request.use((config) => {
      if (config.url && shouldBypassProxy(config.url)) {
        if (mtlsAgent) {
          config.httpsAgent = mtlsAgent;
          config.httpAgent = mtlsAgent;
        } else {
          delete config.httpsAgent;
          delete config.httpAgent;
        }
      } else {
        config.httpsAgent = proxyAgent;
        config.httpAgent = proxyAgent;
      }
      return config;
    });
    require("undici").setGlobalDispatcher(
      getProxyAgent(proxyUrl)
    );
  } else if (mtlsAgent) {
    axios.defaults.httpsAgent = mtlsAgent;
    const mtlsOptions = getTLSFetchOptions();
    if (mtlsOptions.dispatcher) {
      ;
      require("undici").setGlobalDispatcher(
        mtlsOptions.dispatcher
      );
    }
  }
}
async function getAWSClientProxyConfig() {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) {
    return {};
  }
  const [{ NodeHttpHandler }, { defaultProvider }] = await Promise.all([
    import("@smithy/node-http-handler"),
    import("@aws-sdk/credential-provider-node")
  ]);
  const agent = createHttpsProxyAgent(proxyUrl);
  const requestHandler = new NodeHttpHandler({
    httpAgent: agent,
    httpsAgent: agent
  });
  return {
    requestHandler,
    credentials: defaultProvider({
      clientConfig: { requestHandler }
    })
  };
}
function clearProxyCache() {
  getProxyAgent.cache.clear?.();
  logForDebugging("Cleared proxy agent cache");
}
export {
  _resetKeepAliveForTesting,
  clearProxyCache,
  configureGlobalAgents,
  createAxiosInstance,
  disableKeepAlive,
  getAWSClientProxyConfig,
  getAddressFamily,
  getNoProxy,
  getProxyAgent,
  getProxyFetchOptions,
  getProxyUrl,
  getWebSocketProxyAgent,
  getWebSocketProxyUrl,
  shouldBypassProxy
};
