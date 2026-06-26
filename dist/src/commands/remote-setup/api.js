import axios from "axios";
import { getOauthConfig } from "../../constants/oauth.js";
import { logForDebugging } from "../../utils/debug.js";
import { getOAuthHeaders, prepareApiRequest } from "../../utils/teleport/api.js";
import { fetchEnvironments } from "../../utils/teleport/environments.js";
const CCR_BYOC_BETA_HEADER = "ccr-byoc-2025-07-29";
class RedactedGithubToken {
  #value;
  constructor(raw) {
    this.#value = raw;
  }
  reveal() {
    return this.#value;
  }
  toString() {
    return "[REDACTED:gh-token]";
  }
  toJSON() {
    return "[REDACTED:gh-token]";
  }
  [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")]() {
    return "[REDACTED:gh-token]";
  }
}
async function importGithubToken(token) {
  let accessToken, orgUUID;
  try {
    ;
    ({ accessToken, orgUUID } = await prepareApiRequest());
  } catch {
    return { ok: false, error: { kind: "not_signed_in" } };
  }
  const url = `${getOauthConfig().BASE_API_URL}/v1/code/github/import-token`;
  const headers = {
    ...getOAuthHeaders(accessToken),
    "anthropic-beta": CCR_BYOC_BETA_HEADER,
    "x-organization-uuid": orgUUID
  };
  try {
    const response = await axios.post(
      url,
      { token: token.reveal() },
      { headers, timeout: 15e3, validateStatus: () => true }
    );
    if (response.status === 200) {
      return { ok: true, result: response.data };
    }
    if (response.status === 400) {
      return { ok: false, error: { kind: "invalid_token" } };
    }
    if (response.status === 401) {
      return { ok: false, error: { kind: "not_signed_in" } };
    }
    logForDebugging(`import-token returned ${response.status}`, {
      level: "error"
    });
    return { ok: false, error: { kind: "server", status: response.status } };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      logForDebugging(`import-token network error: ${err.code ?? "unknown"}`, {
        level: "error"
      });
    }
    return { ok: false, error: { kind: "network" } };
  }
}
async function hasExistingEnvironment() {
  try {
    const envs = await fetchEnvironments();
    return envs.length > 0;
  } catch {
    return false;
  }
}
async function createDefaultEnvironment() {
  let accessToken, orgUUID;
  try {
    ;
    ({ accessToken, orgUUID } = await prepareApiRequest());
  } catch {
    return false;
  }
  if (await hasExistingEnvironment()) {
    return true;
  }
  const url = `${getOauthConfig().BASE_API_URL}/v1/environment_providers/cloud/create`;
  const headers = {
    ...getOAuthHeaders(accessToken),
    "x-organization-uuid": orgUUID
  };
  try {
    const response = await axios.post(
      url,
      {
        name: "Default",
        kind: "anthropic_cloud",
        description: "Default - trusted network access",
        config: {
          environment_type: "anthropic",
          cwd: "/home/user",
          init_script: null,
          environment: {},
          languages: [
            { name: "python", version: "3.11" },
            { name: "node", version: "20" }
          ],
          network_config: {
            allowed_hosts: [],
            allow_default_hosts: true
          }
        }
      },
      { headers, timeout: 15e3, validateStatus: () => true }
    );
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}
async function isSignedIn() {
  try {
    await prepareApiRequest();
    return true;
  } catch {
    return false;
  }
}
function getCodeWebUrl() {
  return `${getOauthConfig().CLAUDE_AI_ORIGIN}/code`;
}
export {
  RedactedGithubToken,
  createDefaultEnvironment,
  getCodeWebUrl,
  importGithubToken,
  isSignedIn
};
