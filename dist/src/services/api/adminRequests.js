import axios from "axios";
import { getOauthConfig } from "../../constants/oauth.js";
import { getOAuthHeaders, prepareApiRequest } from "../../utils/teleport/api.js";
async function createAdminRequest(params) {
  const { accessToken, orgUUID } = await prepareApiRequest();
  const headers = {
    ...getOAuthHeaders(accessToken),
    "x-organization-uuid": orgUUID
  };
  const url = `${getOauthConfig().BASE_API_URL}/api/oauth/organizations/${orgUUID}/admin_requests`;
  const response = await axios.post(url, params, { headers });
  return response.data;
}
async function getMyAdminRequests(requestType, statuses) {
  const { accessToken, orgUUID } = await prepareApiRequest();
  const headers = {
    ...getOAuthHeaders(accessToken),
    "x-organization-uuid": orgUUID
  };
  let url = `${getOauthConfig().BASE_API_URL}/api/oauth/organizations/${orgUUID}/admin_requests/me?request_type=${requestType}`;
  for (const status of statuses) {
    url += `&statuses=${status}`;
  }
  const response = await axios.get(url, {
    headers
  });
  return response.data;
}
async function checkAdminRequestEligibility(requestType) {
  const { accessToken, orgUUID } = await prepareApiRequest();
  const headers = {
    ...getOAuthHeaders(accessToken),
    "x-organization-uuid": orgUUID
  };
  const url = `${getOauthConfig().BASE_API_URL}/api/oauth/organizations/${orgUUID}/admin_requests/eligibility?request_type=${requestType}`;
  const response = await axios.get(url, {
    headers
  });
  return response.data;
}
export {
  checkAdminRequestEligibility,
  createAdminRequest,
  getMyAdminRequests
};
