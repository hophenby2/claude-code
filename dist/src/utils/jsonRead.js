const UTF8_BOM = "\uFEFF";
function stripBOM(content) {
  return content.startsWith(UTF8_BOM) ? content.slice(1) : content;
}
export {
  stripBOM
};
