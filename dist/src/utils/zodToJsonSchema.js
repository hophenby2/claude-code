import { toJSONSchema } from "zod/v4";
const cache = /* @__PURE__ */ new WeakMap();
function zodToJsonSchema(schema) {
  const hit = cache.get(schema);
  if (hit) return hit;
  const result = toJSONSchema(schema);
  cache.set(schema, result);
  return result;
}
export {
  zodToJsonSchema
};
