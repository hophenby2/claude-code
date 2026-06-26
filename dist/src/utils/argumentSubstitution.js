import { tryParseShellCommand } from "./bash/shellQuote.js";
function parseArguments(args) {
  if (!args || !args.trim()) {
    return [];
  }
  const result = tryParseShellCommand(args, (key) => `$${key}`);
  if (!result.success) {
    return args.split(/\s+/).filter(Boolean);
  }
  return result.tokens.filter(
    (token) => typeof token === "string"
  );
}
function parseArgumentNames(argumentNames) {
  if (!argumentNames) {
    return [];
  }
  const isValidName = (name) => typeof name === "string" && name.trim() !== "" && !/^\d+$/.test(name);
  if (Array.isArray(argumentNames)) {
    return argumentNames.filter(isValidName);
  }
  if (typeof argumentNames === "string") {
    return argumentNames.split(/\s+/).filter(isValidName);
  }
  return [];
}
function generateProgressiveArgumentHint(argNames, typedArgs) {
  const remaining = argNames.slice(typedArgs.length);
  if (remaining.length === 0) return void 0;
  return remaining.map((name) => `[${name}]`).join(" ");
}
function substituteArguments(content, args, appendIfNoPlaceholder = true, argumentNames = []) {
  if (args === void 0 || args === null) {
    return content;
  }
  const parsedArgs = parseArguments(args);
  const originalContent = content;
  for (let i = 0; i < argumentNames.length; i++) {
    const name = argumentNames[i];
    if (!name) continue;
    content = content.replace(
      new RegExp(`\\$${name}(?![\\[\\w])`, "g"),
      parsedArgs[i] ?? ""
    );
  }
  content = content.replace(/\$ARGUMENTS\[(\d+)\]/g, (_, indexStr) => {
    const index = parseInt(indexStr, 10);
    return parsedArgs[index] ?? "";
  });
  content = content.replace(/\$(\d+)(?!\w)/g, (_, indexStr) => {
    const index = parseInt(indexStr, 10);
    return parsedArgs[index] ?? "";
  });
  content = content.replaceAll("$ARGUMENTS", args);
  if (content === originalContent && appendIfNoPlaceholder && args) {
    content = content + `

ARGUMENTS: ${args}`;
  }
  return content;
}
export {
  generateProgressiveArgumentHint,
  parseArgumentNames,
  parseArguments,
  substituteArguments
};
