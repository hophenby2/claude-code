import { randomBytes } from "crypto";
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateUuid(maybeUuid) {
  if (typeof maybeUuid !== "string") return null;
  return uuidRegex.test(maybeUuid) ? maybeUuid : null;
}
function createAgentId(label) {
  const suffix = randomBytes(8).toString("hex");
  return label ? `a${label}-${suffix}` : `a${suffix}`;
}
export {
  createAgentId,
  validateUuid
};
