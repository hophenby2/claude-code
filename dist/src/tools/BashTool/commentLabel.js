function extractBashCommentLabel(command) {
  const nl = command.indexOf("\n");
  const firstLine = (nl === -1 ? command : command.slice(0, nl)).trim();
  if (!firstLine.startsWith("#") || firstLine.startsWith("#!")) return void 0;
  return firstLine.replace(/^#+\s*/, "") || void 0;
}
export {
  extractBashCommentLabel
};
