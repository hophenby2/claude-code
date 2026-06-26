import { useCallback, useState } from "react";
import { getIsNonInteractiveSession } from "../bootstrap/state.js";
import { verifyApiKey } from "../services/api/claude.js";
import {
  getAnthropicApiKeyWithSource,
  getApiKeyFromApiKeyHelper,
  isAnthropicAuthEnabled,
  isClaudeAISubscriber
} from "../utils/auth.js";
function useApiKeyVerification() {
  const [status, setStatus] = useState(() => {
    if (!isAnthropicAuthEnabled() || isClaudeAISubscriber()) {
      return "valid";
    }
    const { key, source } = getAnthropicApiKeyWithSource({
      skipRetrievingKeyFromApiKeyHelper: true
    });
    if (key || source === "apiKeyHelper") {
      return "loading";
    }
    return "missing";
  });
  const [error, setError] = useState(null);
  const verify = useCallback(async () => {
    if (!isAnthropicAuthEnabled() || isClaudeAISubscriber()) {
      setStatus("valid");
      return;
    }
    await getApiKeyFromApiKeyHelper(getIsNonInteractiveSession());
    const { key: apiKey, source } = getAnthropicApiKeyWithSource();
    if (!apiKey) {
      if (source === "apiKeyHelper") {
        setStatus("error");
        setError(new Error("API key helper did not return a valid key"));
        return;
      }
      const newStatus = "missing";
      setStatus(newStatus);
      return;
    }
    try {
      const isValid = await verifyApiKey(apiKey, false);
      const newStatus = isValid ? "valid" : "invalid";
      setStatus(newStatus);
      return;
    } catch (error2) {
      setError(error2);
      const newStatus = "error";
      setStatus(newStatus);
      return;
    }
  }, []);
  return {
    status,
    reverify: verify,
    error
  };
}
export {
  useApiKeyVerification
};
