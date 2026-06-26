function djb2Hash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
  }
  return hash;
}
function hashContent(content) {
  if (typeof Bun !== "undefined") {
    return Bun.hash(content).toString();
  }
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(content).digest("hex");
}
function hashPair(a, b) {
  if (typeof Bun !== "undefined") {
    return Bun.hash(b, Bun.hash(a)).toString();
  }
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(a).update("\0").update(b).digest("hex");
}
export {
  djb2Hash,
  hashContent,
  hashPair
};
