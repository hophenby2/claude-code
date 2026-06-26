import axios from "axios";
import { getOauthConfig } from "../../constants/oauth.js";
import { isClaudeAISubscriber } from "../../utils/auth.js";
import { logForDebugging } from "../../utils/debug.js";
import { getOAuthHeaders, prepareApiRequest } from "../../utils/teleport/api.js";
async function fetchUltrareviewQuota() {
  if (!isClaudeAISubscriber()) return null;
  try {
    const { accessToken, orgUUID } = await prepareApiRequest();
    const response = await axios.get(
      `${getOauthConfig().BASE_API_URL}/v1/ultrareview/quota`,
      {
        headers: {
          ...getOAuthHeaders(accessToken),
          "x-organization-uuid": orgUUID
        },
        timeout: 5e3
      }
    );
    return response.data;
  } catch (error) {
    logForDebugging(`fetchUltrareviewQuota failed: ${error}`);
    return null;
  }
}
export {
  fetchUltrareviewQuota
};
