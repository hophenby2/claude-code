import axios from "axios";
import { randomUUID } from "crypto";
import { getOauthConfig } from "../../constants/oauth.js";
import { getOrganizationUUID } from "../../services/oauth/client.js";
import z from "zod/v4";
import { getClaudeAIOAuthTokens } from "../auth.js";
import { logForDebugging } from "../debug.js";
import { parseGitHubRepository } from "../detectRepository.js";
import { errorMessage, toError } from "../errors.js";
import { lazySchema } from "../lazySchema.js";
import { logError } from "../log.js";
import { sleep } from "../sleep.js";
import { jsonStringify } from "../slowOperations.js";
const TELEPORT_RETRY_DELAYS = [2e3, 4e3, 8e3, 16e3];
const MAX_TELEPORT_RETRIES = TELEPORT_RETRY_DELAYS.length;
const CCR_BYOC_BETA = "ccr-byoc-2025-07-29";
function isTransientNetworkError(error) {
  if (!axios.isAxiosError(error)) {
    return false;
  }
  if (!error.response) {
    return true;
  }
  if (error.response.status >= 500) {
    return true;
  }
  return false;
}
async function axiosGetWithRetry(url, config) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_TELEPORT_RETRIES; attempt++) {
    try {
      return await axios.get(url, config);
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error)) {
        throw error;
      }
      if (attempt >= MAX_TELEPORT_RETRIES) {
        logForDebugging(
          `Teleport request failed after ${attempt + 1} attempts: ${errorMessage(error)}`
        );
        throw error;
      }
      const delay = TELEPORT_RETRY_DELAYS[attempt] ?? 2e3;
      logForDebugging(
        `Teleport request failed (attempt ${attempt + 1}/${MAX_TELEPORT_RETRIES + 1}), retrying in ${delay}ms: ${errorMessage(error)}`
      );
      await sleep(delay);
    }
  }
  throw lastError;
}
const CodeSessionSchema = lazySchema(
  () => z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    status: z.enum([
      "idle",
      "working",
      "waiting",
      "completed",
      "archived",
      "cancelled",
      "rejected"
    ]),
    repo: z.object({
      name: z.string(),
      owner: z.object({
        login: z.string()
      }),
      default_branch: z.string().optional()
    }).nullable(),
    turns: z.array(z.string()),
    created_at: z.string(),
    updated_at: z.string()
  })
);
async function prepareApiRequest() {
  const accessToken = getClaudeAIOAuthTokens()?.accessToken;
  if (accessToken === void 0) {
    throw new Error(
      "Claude Code web sessions require authentication with a Claude.ai account. API key authentication is not sufficient. Please run /login to authenticate, or check your authentication status with /status."
    );
  }
  const orgUUID = await getOrganizationUUID();
  if (!orgUUID) {
    throw new Error("Unable to get organization UUID");
  }
  return { accessToken, orgUUID };
}
async function fetchCodeSessionsFromSessionsAPI() {
  const { accessToken, orgUUID } = await prepareApiRequest();
  const url = `${getOauthConfig().BASE_API_URL}/v1/sessions`;
  try {
    const headers = {
      ...getOAuthHeaders(accessToken),
      "anthropic-beta": "ccr-byoc-2025-07-29",
      "x-organization-uuid": orgUUID
    };
    const response = await axiosGetWithRetry(url, {
      headers
    });
    if (response.status !== 200) {
      throw new Error(`Failed to fetch code sessions: ${response.statusText}`);
    }
    const sessions = response.data.data.map((session) => {
      const gitSource = session.session_context.sources.find(
        (source) => source.type === "git_repository"
      );
      let repo = null;
      if (gitSource?.url) {
        const repoPath = parseGitHubRepository(gitSource.url);
        if (repoPath) {
          const [owner, name] = repoPath.split("/");
          if (owner && name) {
            repo = {
              name,
              owner: {
                login: owner
              },
              default_branch: gitSource.revision || void 0
            };
          }
        }
      }
      return {
        id: session.id,
        title: session.title || "Untitled",
        description: "",
        // SessionResource doesn't have description field
        status: session.session_status,
        // Map session_status to status
        repo,
        turns: [],
        // SessionResource doesn't have turns field
        created_at: session.created_at,
        updated_at: session.updated_at
      };
    });
    return sessions;
  } catch (error) {
    const err = toError(error);
    logError(err);
    throw error;
  }
}
function getOAuthHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01"
  };
}
async function fetchSession(sessionId) {
  const { accessToken, orgUUID } = await prepareApiRequest();
  const url = `${getOauthConfig().BASE_API_URL}/v1/sessions/${sessionId}`;
  const headers = {
    ...getOAuthHeaders(accessToken),
    "anthropic-beta": "ccr-byoc-2025-07-29",
    "x-organization-uuid": orgUUID
  };
  const response = await axios.get(url, {
    headers,
    timeout: 15e3,
    validateStatus: (status) => status < 500
  });
  if (response.status !== 200) {
    const errorData = response.data;
    const apiMessage = errorData?.error?.message;
    if (response.status === 404) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (response.status === 401) {
      throw new Error("Session expired. Please run /login to sign in again.");
    }
    throw new Error(
      apiMessage || `Failed to fetch session: ${response.status} ${response.statusText}`
    );
  }
  return response.data;
}
function getBranchFromSession(session) {
  const gitOutcome = session.session_context.outcomes?.find(
    (outcome) => outcome.type === "git_repository"
  );
  return gitOutcome?.git_info?.branches[0];
}
async function sendEventToRemoteSession(sessionId, messageContent, opts) {
  try {
    const { accessToken, orgUUID } = await prepareApiRequest();
    const url = `${getOauthConfig().BASE_API_URL}/v1/sessions/${sessionId}/events`;
    const headers = {
      ...getOAuthHeaders(accessToken),
      "anthropic-beta": "ccr-byoc-2025-07-29",
      "x-organization-uuid": orgUUID
    };
    const userEvent = {
      uuid: opts?.uuid ?? randomUUID(),
      session_id: sessionId,
      type: "user",
      parent_tool_use_id: null,
      message: {
        role: "user",
        content: messageContent
      }
    };
    const requestBody = {
      events: [userEvent]
    };
    logForDebugging(
      `[sendEventToRemoteSession] Sending event to session ${sessionId}`
    );
    const response = await axios.post(url, requestBody, {
      headers,
      validateStatus: (status) => status < 500,
      timeout: 3e4
    });
    if (response.status === 200 || response.status === 201) {
      logForDebugging(
        `[sendEventToRemoteSession] Successfully sent event to session ${sessionId}`
      );
      return true;
    }
    logForDebugging(
      `[sendEventToRemoteSession] Failed with status ${response.status}: ${jsonStringify(response.data)}`
    );
    return false;
  } catch (error) {
    logForDebugging(`[sendEventToRemoteSession] Error: ${errorMessage(error)}`);
    return false;
  }
}
async function updateSessionTitle(sessionId, title) {
  try {
    const { accessToken, orgUUID } = await prepareApiRequest();
    const url = `${getOauthConfig().BASE_API_URL}/v1/sessions/${sessionId}`;
    const headers = {
      ...getOAuthHeaders(accessToken),
      "anthropic-beta": "ccr-byoc-2025-07-29",
      "x-organization-uuid": orgUUID
    };
    logForDebugging(
      `[updateSessionTitle] Updating title for session ${sessionId}: "${title}"`
    );
    const response = await axios.patch(
      url,
      { title },
      {
        headers,
        validateStatus: (status) => status < 500
      }
    );
    if (response.status === 200) {
      logForDebugging(
        `[updateSessionTitle] Successfully updated title for session ${sessionId}`
      );
      return true;
    }
    logForDebugging(
      `[updateSessionTitle] Failed with status ${response.status}: ${jsonStringify(response.data)}`
    );
    return false;
  } catch (error) {
    logForDebugging(`[updateSessionTitle] Error: ${errorMessage(error)}`);
    return false;
  }
}
export {
  CCR_BYOC_BETA,
  CodeSessionSchema,
  axiosGetWithRetry,
  fetchCodeSessionsFromSessionsAPI,
  fetchSession,
  getBranchFromSession,
  getOAuthHeaders,
  isTransientNetworkError,
  prepareApiRequest,
  sendEventToRemoteSession,
  updateSessionTitle
};
