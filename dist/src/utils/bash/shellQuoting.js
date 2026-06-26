import { quote } from "./shellQuote.js";
function containsHeredoc(command) {
  if (/\d\s*<<\s*\d/.test(command) || /\[\[\s*\d+\s*<<\s*\d+\s*\]\]/.test(command) || /\$\(\(.*<<.*\)\)/.test(command)) {
    return false;
  }
  const heredocRegex = /<<-?\s*(?:(['"]?)(\w+)\1|\\(\w+))/;
  return heredocRegex.test(command);
}
function containsMultilineString(command) {
  const singleQuoteMultiline = /'(?:[^'\\]|\\.)*\n(?:[^'\\]|\\.)*'/;
  const doubleQuoteMultiline = /"(?:[^"\\]|\\.)*\n(?:[^"\\]|\\.)*"/;
  return singleQuoteMultiline.test(command) || doubleQuoteMultiline.test(command);
}
function quoteShellCommand(command, addStdinRedirect = true) {
  if (containsHeredoc(command) || containsMultilineString(command)) {
    const escaped = command.replace(/'/g, `'"'"'`);
    const quoted = `'${escaped}'`;
    if (containsHeredoc(command)) {
      return quoted;
    }
    return addStdinRedirect ? `${quoted} < /dev/null` : quoted;
  }
  if (addStdinRedirect) {
    return quote([command, "<", "/dev/null"]);
  }
  return quote([command]);
}
function hasStdinRedirect(command) {
  return /(?:^|[\s;&|])<(?![<(])\s*\S+/.test(command);
}
function shouldAddStdinRedirect(command) {
  if (containsHeredoc(command)) {
    return false;
  }
  if (hasStdinRedirect(command)) {
    return false;
  }
  return true;
}
const NUL_REDIRECT_REGEX = /(\d?&?>+\s*)[Nn][Uu][Ll](?=\s|$|[|&;)\n])/g;
function rewriteWindowsNullRedirect(command) {
  return command.replace(NUL_REDIRECT_REGEX, "$1/dev/null");
}
export {
  hasStdinRedirect,
  quoteShellCommand,
  rewriteWindowsNullRedirect,
  shouldAddStdinRedirect
};
