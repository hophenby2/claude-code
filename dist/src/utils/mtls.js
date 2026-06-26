import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
import { Agent as HttpsAgent } from "https";
import memoize from "lodash-es/memoize.js";
import { getCACertificates } from "./caCerts.js";
import { logForDebugging } from "./debug.js";
import { getFsImplementation } from "./fsOperations.js";
const getMTLSConfig = memoize(() => {
  const config = {};
  if (process.env.CLAUDE_CODE_CLIENT_CERT) {
    try {
      config.cert = getFsImplementation().readFileSync(
        process.env.CLAUDE_CODE_CLIENT_CERT,
        { encoding: "utf8" }
      );
      logForDebugging(
        "mTLS: Loaded client certificate from CLAUDE_CODE_CLIENT_CERT"
      );
    } catch (error) {
      logForDebugging(`mTLS: Failed to load client certificate: ${error}`, {
        level: "error"
      });
    }
  }
  if (process.env.CLAUDE_CODE_CLIENT_KEY) {
    try {
      config.key = getFsImplementation().readFileSync(
        process.env.CLAUDE_CODE_CLIENT_KEY,
        { encoding: "utf8" }
      );
      logForDebugging("mTLS: Loaded client key from CLAUDE_CODE_CLIENT_KEY");
    } catch (error) {
      logForDebugging(`mTLS: Failed to load client key: ${error}`, {
        level: "error"
      });
    }
  }
  if (process.env.CLAUDE_CODE_CLIENT_KEY_PASSPHRASE) {
    config.passphrase = process.env.CLAUDE_CODE_CLIENT_KEY_PASSPHRASE;
    logForDebugging("mTLS: Using client key passphrase");
  }
  if (Object.keys(config).length === 0) {
    return void 0;
  }
  return config;
});
const getMTLSAgent = memoize(() => {
  const mtlsConfig = getMTLSConfig();
  const caCerts = getCACertificates();
  if (!mtlsConfig && !caCerts) {
    return void 0;
  }
  const agentOptions = {
    ...mtlsConfig,
    ...caCerts && { ca: caCerts },
    // Enable keep-alive for better performance
    keepAlive: true
  };
  logForDebugging("mTLS: Creating HTTPS agent with custom certificates");
  return new HttpsAgent(agentOptions);
});
function getWebSocketTLSOptions() {
  const mtlsConfig = getMTLSConfig();
  const caCerts = getCACertificates();
  if (!mtlsConfig && !caCerts) {
    return void 0;
  }
  return {
    ...mtlsConfig,
    ...caCerts && { ca: caCerts }
  };
}
function getTLSFetchOptions() {
  const mtlsConfig = getMTLSConfig();
  const caCerts = getCACertificates();
  if (!mtlsConfig && !caCerts) {
    return {};
  }
  const tlsConfig = {
    ...mtlsConfig,
    ...caCerts && { ca: caCerts }
  };
  if (typeof Bun !== "undefined") {
    return { tls: tlsConfig };
  }
  logForDebugging("TLS: Created undici agent with custom certificates");
  const undiciMod = require2("undici");
  const agent = new undiciMod.Agent({
    connect: {
      cert: tlsConfig.cert,
      key: tlsConfig.key,
      passphrase: tlsConfig.passphrase,
      ...tlsConfig.ca && { ca: tlsConfig.ca }
    },
    pipelining: 1
  });
  return { dispatcher: agent };
}
function clearMTLSCache() {
  getMTLSConfig.cache.clear?.();
  getMTLSAgent.cache.clear?.();
  logForDebugging("Cleared mTLS configuration cache");
}
function configureGlobalMTLS() {
  const mtlsConfig = getMTLSConfig();
  if (!mtlsConfig) {
    return;
  }
  if (process.env.NODE_EXTRA_CA_CERTS) {
    logForDebugging(
      "NODE_EXTRA_CA_CERTS detected - Node.js will automatically append to built-in CAs"
    );
  }
}
export {
  clearMTLSCache,
  configureGlobalMTLS,
  getMTLSAgent,
  getMTLSConfig,
  getTLSFetchOptions,
  getWebSocketTLSOptions
};
