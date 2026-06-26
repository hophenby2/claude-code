const XML_TAG_BLOCK_PATTERN = /<([a-z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>\n?/g;
function stripDisplayTags(text) {
  const result = text.replace(XML_TAG_BLOCK_PATTERN, "").trim();
  return result || text;
}
function stripDisplayTagsAllowEmpty(text) {
  return text.replace(XML_TAG_BLOCK_PATTERN, "").trim();
}
const IDE_CONTEXT_TAGS_PATTERN = /<(ide_opened_file|ide_selection)(?:\s[^>]*)?>[\s\S]*?<\/\1>\n?/g;
function stripIdeContextTags(text) {
  return text.replace(IDE_CONTEXT_TAGS_PATTERN, "").trim();
}
export {
  stripDisplayTags,
  stripDisplayTagsAllowEmpty,
  stripIdeContextTags
};
