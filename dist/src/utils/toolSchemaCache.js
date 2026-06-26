const TOOL_SCHEMA_CACHE = /* @__PURE__ */ new Map();
function getToolSchemaCache() {
  return TOOL_SCHEMA_CACHE;
}
function clearToolSchemaCache() {
  TOOL_SCHEMA_CACHE.clear();
}
export {
  clearToolSchemaCache,
  getToolSchemaCache
};
