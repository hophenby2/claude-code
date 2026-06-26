import { jsonStringify } from "../../utils/slowOperations.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../analytics/growthbook.js";
function isChannelPermissionRelayEnabled() {
  return getFeatureValue_CACHED_MAY_BE_STALE("tengu_harbor_permissions", false);
}
const PERMISSION_REPLY_RE = /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i;
const ID_ALPHABET = "abcdefghijkmnopqrstuvwxyz";
const ID_AVOID_SUBSTRINGS = [
  "fuck",
  "shit",
  "cunt",
  "cock",
  "dick",
  "twat",
  "piss",
  "crap",
  "bitch",
  "whore",
  "ass",
  "tit",
  "cum",
  "fag",
  "dyke",
  "nig",
  "kike",
  "rape",
  "nazi",
  "damn",
  "poo",
  "pee",
  "wank",
  "anus"
];
function hashToId(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = h >>> 0;
  let s = "";
  for (let i = 0; i < 5; i++) {
    s += ID_ALPHABET[h % 25];
    h = Math.floor(h / 25);
  }
  return s;
}
function shortRequestId(toolUseID) {
  let candidate = hashToId(toolUseID);
  for (let salt = 0; salt < 10; salt++) {
    if (!ID_AVOID_SUBSTRINGS.some((bad) => candidate.includes(bad))) {
      return candidate;
    }
    candidate = hashToId(`${toolUseID}:${salt}`);
  }
  return candidate;
}
function truncateForPreview(input) {
  try {
    const s = jsonStringify(input);
    return s.length > 200 ? s.slice(0, 200) + "\u2026" : s;
  } catch {
    return "(unserializable)";
  }
}
function filterPermissionRelayClients(clients, isInAllowlist) {
  return clients.filter(
    (c) => c.type === "connected" && isInAllowlist(c.name) && c.capabilities?.experimental?.["claude/channel"] !== void 0 && c.capabilities?.experimental?.["claude/channel/permission"] !== void 0
  );
}
function createChannelPermissionCallbacks() {
  const pending = /* @__PURE__ */ new Map();
  return {
    onResponse(requestId, handler) {
      const key = requestId.toLowerCase();
      pending.set(key, handler);
      return () => {
        pending.delete(key);
      };
    },
    resolve(requestId, behavior, fromServer) {
      const key = requestId.toLowerCase();
      const resolver = pending.get(key);
      if (!resolver) return false;
      pending.delete(key);
      resolver({ behavior, fromServer });
      return true;
    }
  };
}
export {
  PERMISSION_REPLY_RE,
  createChannelPermissionCallbacks,
  filterPermissionRelayClients,
  isChannelPermissionRelayEnabled,
  shortRequestId,
  truncateForPreview
};
