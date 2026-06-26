import { createRequire as __createRequire } from "node:module";
const require2 = __createRequire(import.meta.url);
import memoize from "lodash-es/memoize.js";
import { logForDebugging } from "./debug.js";
import { hasNodeOption } from "./envUtils.js";
import { getFsImplementation } from "./fsOperations.js";
const getCACertificates = memoize(() => {
  const useSystemCA = hasNodeOption("--use-system-ca") || hasNodeOption("--use-openssl-ca");
  const extraCertsPath = process.env.NODE_EXTRA_CA_CERTS;
  logForDebugging(
    `CA certs: useSystemCA=${useSystemCA}, extraCertsPath=${extraCertsPath}`
  );
  if (!useSystemCA && !extraCertsPath) {
    return void 0;
  }
  const tls = require2("tls");
  const certs = [];
  if (useSystemCA) {
    const getCACerts = tls.getCACertificates;
    const systemCAs = getCACerts?.("system");
    if (systemCAs && systemCAs.length > 0) {
      certs.push(...systemCAs);
      logForDebugging(
        `CA certs: Loaded ${certs.length} system CA certificates (--use-system-ca)`
      );
    } else if (!getCACerts && !extraCertsPath) {
      logForDebugging(
        "CA certs: --use-system-ca set but system CA API unavailable, deferring to runtime"
      );
      return void 0;
    } else {
      certs.push(...tls.rootCertificates);
      logForDebugging(
        `CA certs: Loaded ${certs.length} bundled root certificates as base (--use-system-ca fallback)`
      );
    }
  } else {
    certs.push(...tls.rootCertificates);
    logForDebugging(
      `CA certs: Loaded ${certs.length} bundled root certificates as base`
    );
  }
  if (extraCertsPath) {
    try {
      const extraCert = getFsImplementation().readFileSync(extraCertsPath, {
        encoding: "utf8"
      });
      certs.push(extraCert);
      logForDebugging(
        `CA certs: Appended extra certificates from NODE_EXTRA_CA_CERTS (${extraCertsPath})`
      );
    } catch (error) {
      logForDebugging(
        `CA certs: Failed to read NODE_EXTRA_CA_CERTS file (${extraCertsPath}): ${error}`,
        { level: "error" }
      );
    }
  }
  return certs.length > 0 ? certs : void 0;
});
function clearCACertsCache() {
  getCACertificates.cache.clear?.();
  logForDebugging("Cleared CA certificates cache");
}
export {
  clearCACertsCache,
  getCACertificates
};
