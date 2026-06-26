import { AbortError, ShellError } from "./errors.js";
import { INTERRUPT_MESSAGE_FOR_TOOL_USE } from "./messages.js";
function formatError(error) {
  if (error instanceof AbortError) {
    return error.message || INTERRUPT_MESSAGE_FOR_TOOL_USE;
  }
  if (!(error instanceof Error)) {
    return String(error);
  }
  const parts = getErrorParts(error);
  const fullMessage = parts.filter(Boolean).join("\n").trim() || "Command failed with no output";
  if (fullMessage.length <= 1e4) {
    return fullMessage;
  }
  const halfLength = 5e3;
  const start = fullMessage.slice(0, halfLength);
  const end = fullMessage.slice(-halfLength);
  return `${start}

... [${fullMessage.length - 1e4} characters truncated] ...

${end}`;
}
function getErrorParts(error) {
  if (error instanceof ShellError) {
    return [
      `Exit code ${error.code}`,
      error.interrupted ? INTERRUPT_MESSAGE_FOR_TOOL_USE : "",
      error.stderr,
      error.stdout
    ];
  }
  const parts = [error.message];
  if ("stderr" in error && typeof error.stderr === "string") {
    parts.push(error.stderr);
  }
  if ("stdout" in error && typeof error.stdout === "string") {
    parts.push(error.stdout);
  }
  return parts;
}
function formatValidationPath(path) {
  if (path.length === 0) return "";
  return path.reduce((acc, segment, index) => {
    const segmentStr = String(segment);
    if (typeof segment === "number") {
      return `${String(acc)}[${segmentStr}]`;
    }
    return index === 0 ? segmentStr : `${String(acc)}.${segmentStr}`;
  }, "");
}
function formatZodValidationError(toolName, error) {
  const missingParams = error.issues.filter(
    (err) => err.code === "invalid_type" && err.message.includes("received undefined")
  ).map((err) => formatValidationPath(err.path));
  const unexpectedParams = error.issues.filter((err) => err.code === "unrecognized_keys").flatMap((err) => err.keys);
  const typeMismatchParams = error.issues.filter(
    (err) => err.code === "invalid_type" && !err.message.includes("received undefined")
  ).map((err) => {
    const typeErr = err;
    const receivedMatch = err.message.match(/received (\w+)/);
    const received = receivedMatch ? receivedMatch[1] : "unknown";
    return {
      param: formatValidationPath(err.path),
      expected: typeErr.expected,
      received
    };
  });
  let errorContent = error.message;
  const errorParts = [];
  if (missingParams.length > 0) {
    const missingParamErrors = missingParams.map(
      (param) => `The required parameter \`${param}\` is missing`
    );
    errorParts.push(...missingParamErrors);
  }
  if (unexpectedParams.length > 0) {
    const unexpectedParamErrors = unexpectedParams.map(
      (param) => `An unexpected parameter \`${param}\` was provided`
    );
    errorParts.push(...unexpectedParamErrors);
  }
  if (typeMismatchParams.length > 0) {
    const typeErrors = typeMismatchParams.map(
      ({ param, expected, received }) => `The parameter \`${param}\` type is expected as \`${expected}\` but provided as \`${received}\``
    );
    errorParts.push(...typeErrors);
  }
  if (errorParts.length > 0) {
    errorContent = `${toolName} failed due to the following ${errorParts.length > 1 ? "issues" : "issue"}:
${errorParts.join("\n")}`;
  }
  return errorContent;
}
export {
  formatError,
  formatZodValidationError,
  getErrorParts
};
