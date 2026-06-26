import { SHELL_KEYWORDS } from "./bashParser.js";
import { PARSE_ABORTED, parseCommandRaw } from "./parser.js";
const STRUCTURAL_TYPES = /* @__PURE__ */ new Set([
  "program",
  "list",
  "pipeline",
  "redirected_statement"
]);
const SEPARATOR_TYPES = /* @__PURE__ */ new Set(["&&", "||", "|", ";", "&", "|&", "\n"]);
const CMDSUB_PLACEHOLDER = "__CMDSUB_OUTPUT__";
const VAR_PLACEHOLDER = "__TRACKED_VAR__";
function containsAnyPlaceholder(value) {
  return value.includes(CMDSUB_PLACEHOLDER) || value.includes(VAR_PLACEHOLDER);
}
const BARE_VAR_UNSAFE_RE = /[ \t\n*?[]/;
const STDBUF_SHORT_SEP_RE = /^-[ioe]$/;
const STDBUF_SHORT_FUSED_RE = /^-[ioe]./;
const STDBUF_LONG_RE = /^--(input|output|error)=/;
const SAFE_ENV_VARS = /* @__PURE__ */ new Set([
  "HOME",
  // user's home directory
  "PWD",
  // current working directory (bash maintains)
  "OLDPWD",
  // previous directory
  "USER",
  // current username
  "LOGNAME",
  // login name
  "SHELL",
  // user's login shell
  "PATH",
  // executable search path
  "HOSTNAME",
  // machine hostname
  "UID",
  // user id
  "EUID",
  // effective user id
  "PPID",
  // parent process id
  "RANDOM",
  // random number (bash builtin)
  "SECONDS",
  // seconds since shell start
  "LINENO",
  // current line number
  "TMPDIR",
  // temp directory
  // Special bash variables — always set, values are shell-controlled:
  "BASH_VERSION",
  // bash version string
  "BASHPID",
  // current bash process id
  "SHLVL",
  // shell nesting level
  "HISTFILE",
  // history file path
  "IFS"
  // field separator (NOTE: only safe INSIDE strings; as bare arg
  //       $IFS is the classic injection primitive and the insideString
  //       gate in resolveSimpleExpansion correctly blocks it)
]);
const SPECIAL_VAR_NAMES = /* @__PURE__ */ new Set([
  "?",
  // exit status of last command
  "$",
  // current shell PID
  "!",
  // last background PID
  "#",
  // number of positional params
  "0",
  // script name
  "-"
  // shell option flags
]);
const DANGEROUS_TYPES = /* @__PURE__ */ new Set([
  "command_substitution",
  "process_substitution",
  "expansion",
  "simple_expansion",
  "brace_expression",
  "subshell",
  "compound_statement",
  "for_statement",
  "while_statement",
  "until_statement",
  "if_statement",
  "case_statement",
  "function_definition",
  "test_command",
  "ansi_c_string",
  "translated_string",
  "herestring_redirect",
  "heredoc_redirect"
]);
const DANGEROUS_TYPE_IDS = [...DANGEROUS_TYPES];
function nodeTypeId(nodeType) {
  if (!nodeType) return -2;
  if (nodeType === "ERROR") return -1;
  const i = DANGEROUS_TYPE_IDS.indexOf(nodeType);
  return i >= 0 ? i + 1 : 0;
}
const REDIRECT_OPS = {
  ">": ">",
  ">>": ">>",
  "<": "<",
  ">&": ">&",
  "<&": "<&",
  ">|": ">|",
  "&>": "&>",
  "&>>": "&>>",
  "<<<": "<<<"
};
const BRACE_EXPANSION_RE = /\{[^{}\s]*(,|\.\.)[^{}\s]*\}/;
const CONTROL_CHAR_RE = /[\x00-\x08\x0B-\x1F\x7F]/;
const UNICODE_WHITESPACE_RE = /[\u00A0\u1680\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/;
const BACKSLASH_WHITESPACE_RE = /\\[ \t]|[^ \t\n\\]\\\n/;
const ZSH_TILDE_BRACKET_RE = /~\[/;
const ZSH_EQUALS_EXPANSION_RE = /(?:^|[\s;&|])=[a-zA-Z_]/;
const BRACE_WITH_QUOTE_RE = /\{[^}]*['"]/;
function maskBracesInQuotedContexts(cmd) {
  if (!cmd.includes("{")) return cmd;
  const out = [];
  let inSingle = false;
  let inDouble = false;
  let i = 0;
  while (i < cmd.length) {
    const c = cmd[i];
    if (inSingle) {
      if (c === "'") inSingle = false;
      out.push(c === "{" ? " " : c);
      i++;
    } else if (inDouble) {
      if (c === "\\" && (cmd[i + 1] === '"' || cmd[i + 1] === "\\")) {
        out.push(c, cmd[i + 1]);
        i += 2;
      } else {
        if (c === '"') inDouble = false;
        out.push(c === "{" ? " " : c);
        i++;
      }
    } else {
      if (c === "\\" && i + 1 < cmd.length) {
        out.push(c, cmd[i + 1]);
        i += 2;
      } else {
        if (c === "'") inSingle = true;
        else if (c === '"') inDouble = true;
        out.push(c);
        i++;
      }
    }
  }
  return out.join("");
}
const DOLLAR = String.fromCharCode(36);
async function parseForSecurity(cmd) {
  if (cmd === "") return { kind: "simple", commands: [] };
  const root = await parseCommandRaw(cmd);
  return root === null ? { kind: "parse-unavailable" } : parseForSecurityFromAst(cmd, root);
}
function parseForSecurityFromAst(cmd, root) {
  if (CONTROL_CHAR_RE.test(cmd)) {
    return { kind: "too-complex", reason: "Contains control characters" };
  }
  if (UNICODE_WHITESPACE_RE.test(cmd)) {
    return { kind: "too-complex", reason: "Contains Unicode whitespace" };
  }
  if (BACKSLASH_WHITESPACE_RE.test(cmd)) {
    return {
      kind: "too-complex",
      reason: "Contains backslash-escaped whitespace"
    };
  }
  if (ZSH_TILDE_BRACKET_RE.test(cmd)) {
    return {
      kind: "too-complex",
      reason: "Contains zsh ~[ dynamic directory syntax"
    };
  }
  if (ZSH_EQUALS_EXPANSION_RE.test(cmd)) {
    return {
      kind: "too-complex",
      reason: "Contains zsh =cmd equals expansion"
    };
  }
  if (BRACE_WITH_QUOTE_RE.test(maskBracesInQuotedContexts(cmd))) {
    return {
      kind: "too-complex",
      reason: "Contains brace with quote character (expansion obfuscation)"
    };
  }
  const trimmed = cmd.trim();
  if (trimmed === "") {
    return { kind: "simple", commands: [] };
  }
  if (root === PARSE_ABORTED) {
    return {
      kind: "too-complex",
      reason: "Parser aborted (timeout or resource limit) \u2014 possible adversarial input",
      nodeType: "PARSE_ABORT"
    };
  }
  return walkProgram(root);
}
function walkProgram(root) {
  const commands = [];
  const varScope = /* @__PURE__ */ new Map();
  const err = collectCommands(root, commands, varScope);
  if (err) return err;
  return { kind: "simple", commands };
}
function collectCommands(node, commands, varScope) {
  if (node.type === "command") {
    const result = walkCommand(node, [], commands, varScope);
    if (result.kind !== "simple") return result;
    commands.push(...result.commands);
    return null;
  }
  if (node.type === "redirected_statement") {
    return walkRedirectedStatement(node, commands, varScope);
  }
  if (node.type === "comment") {
    return null;
  }
  if (STRUCTURAL_TYPES.has(node.type)) {
    const isPipeline = node.type === "pipeline";
    let needsSnapshot = false;
    if (!isPipeline) {
      for (const c of node.children) {
        if (c && (c.type === "||" || c.type === "&")) {
          needsSnapshot = true;
          break;
        }
      }
    }
    const snapshot = needsSnapshot ? new Map(varScope) : null;
    let scope = isPipeline ? new Map(varScope) : varScope;
    for (const child of node.children) {
      if (!child) continue;
      if (SEPARATOR_TYPES.has(child.type)) {
        if (child.type === "||" || child.type === "|" || child.type === "|&" || child.type === "&") {
          scope = new Map(snapshot ?? varScope);
        }
        continue;
      }
      const err = collectCommands(child, commands, scope);
      if (err) return err;
    }
    return null;
  }
  if (node.type === "negated_command") {
    for (const child of node.children) {
      if (!child) continue;
      if (child.type === "!") continue;
      return collectCommands(child, commands, varScope);
    }
    return null;
  }
  if (node.type === "declaration_command") {
    const argv = [];
    for (const child of node.children) {
      if (!child) continue;
      switch (child.type) {
        case "export":
        case "local":
        case "readonly":
        case "declare":
        case "typeset":
          argv.push(child.text);
          break;
        case "word":
        case "number":
        case "raw_string":
        case "string":
        case "concatenation": {
          const arg = walkArgument(child, commands, varScope);
          if (typeof arg !== "string") return arg;
          if ((argv[0] === "declare" || argv[0] === "typeset" || argv[0] === "local") && /^-[a-zA-Z]*[niaA]/.test(arg)) {
            return {
              kind: "too-complex",
              reason: `declare flag ${arg} changes assignment semantics (nameref/integer/array)`,
              nodeType: "declaration_command"
            };
          }
          if ((argv[0] === "declare" || argv[0] === "typeset" || argv[0] === "local") && arg[0] !== "-" && /^[^=]*\[/.test(arg)) {
            return {
              kind: "too-complex",
              reason: `declare positional '${arg}' contains array subscript \u2014 bash evaluates $(cmd) in subscripts`,
              nodeType: "declaration_command"
            };
          }
          argv.push(arg);
          break;
        }
        case "variable_assignment": {
          const ev = walkVariableAssignment(child, commands, varScope);
          if ("kind" in ev) return ev;
          applyVarToScope(varScope, ev);
          argv.push(`${ev.name}=${ev.value}`);
          break;
        }
        case "variable_name":
          argv.push(child.text);
          break;
        default:
          return tooComplex(child);
      }
    }
    commands.push({ argv, envVars: [], redirects: [], text: node.text });
    return null;
  }
  if (node.type === "variable_assignment") {
    const ev = walkVariableAssignment(node, commands, varScope);
    if ("kind" in ev) return ev;
    applyVarToScope(varScope, ev);
    return null;
  }
  if (node.type === "for_statement") {
    let loopVar = null;
    let doGroup = null;
    for (const child of node.children) {
      if (!child) continue;
      if (child.type === "variable_name") {
        loopVar = child.text;
      } else if (child.type === "do_group") {
        doGroup = child;
      } else if (child.type === "for" || child.type === "in" || child.type === "select" || child.type === ";") {
        continue;
      } else if (child.type === "command_substitution") {
        const err = collectCommandSubstitution(child, commands, varScope);
        if (err) return err;
      } else {
        const arg = walkArgument(child, commands, varScope);
        if (typeof arg !== "string") return arg;
      }
    }
    if (loopVar === null || doGroup === null) return tooComplex(node);
    if (loopVar === "PS4" || loopVar === "IFS") {
      return {
        kind: "too-complex",
        reason: `${loopVar} as loop variable bypasses assignment validation`,
        nodeType: "for_statement"
      };
    }
    varScope.set(loopVar, VAR_PLACEHOLDER);
    const bodyScope = new Map(varScope);
    for (const c of doGroup.children) {
      if (!c) continue;
      if (c.type === "do" || c.type === "done" || c.type === ";") continue;
      const err = collectCommands(c, commands, bodyScope);
      if (err) return err;
    }
    return null;
  }
  if (node.type === "if_statement" || node.type === "while_statement") {
    let seenThen = false;
    for (const child of node.children) {
      if (!child) continue;
      if (child.type === "if" || child.type === "fi" || child.type === "else" || child.type === "elif" || child.type === "while" || child.type === "until" || child.type === ";") {
        continue;
      }
      if (child.type === "then") {
        seenThen = true;
        continue;
      }
      if (child.type === "do_group") {
        const bodyScope = new Map(varScope);
        for (const c of child.children) {
          if (!c) continue;
          if (c.type === "do" || c.type === "done" || c.type === ";") continue;
          const err2 = collectCommands(c, commands, bodyScope);
          if (err2) return err2;
        }
        continue;
      }
      if (child.type === "elif_clause" || child.type === "else_clause") {
        const branchScope = new Map(varScope);
        for (const c of child.children) {
          if (!c) continue;
          if (c.type === "elif" || c.type === "else" || c.type === "then" || c.type === ";") {
            continue;
          }
          const err2 = collectCommands(c, commands, branchScope);
          if (err2) return err2;
        }
        continue;
      }
      const targetScope = seenThen ? new Map(varScope) : varScope;
      const before = commands.length;
      const err = collectCommands(child, commands, targetScope);
      if (err) return err;
      if (!seenThen) {
        for (let i = before; i < commands.length; i++) {
          const c = commands[i];
          if (c?.argv[0] === "read") {
            for (const a of c.argv.slice(1)) {
              if (!a.startsWith("-") && /^[A-Za-z_][A-Za-z0-9_]*$/.test(a)) {
                const existing = varScope.get(a);
                if (existing !== void 0 && !containsAnyPlaceholder(existing)) {
                  return {
                    kind: "too-complex",
                    reason: `'read ${a}' in condition may not execute (||/pipeline/subshell); cannot prove it overwrites tracked literal '${existing}'`,
                    nodeType: "if_statement"
                  };
                }
                varScope.set(a, VAR_PLACEHOLDER);
              }
            }
          }
        }
      }
    }
    return null;
  }
  if (node.type === "subshell") {
    const innerScope = new Map(varScope);
    for (const child of node.children) {
      if (!child) continue;
      if (child.type === "(" || child.type === ")") continue;
      const err = collectCommands(child, commands, innerScope);
      if (err) return err;
    }
    return null;
  }
  if (node.type === "test_command") {
    const argv = ["[["];
    for (const child of node.children) {
      if (!child) continue;
      if (child.type === "[[" || child.type === "]]") continue;
      if (child.type === "[" || child.type === "]") continue;
      const err = walkTestExpr(child, argv, commands, varScope);
      if (err) return err;
    }
    commands.push({ argv, envVars: [], redirects: [], text: node.text });
    return null;
  }
  if (node.type === "unset_command") {
    const argv = [];
    for (const child of node.children) {
      if (!child) continue;
      switch (child.type) {
        case "unset":
          argv.push(child.text);
          break;
        case "variable_name":
          argv.push(child.text);
          varScope.delete(child.text);
          break;
        case "word": {
          const arg = walkArgument(child, commands, varScope);
          if (typeof arg !== "string") return arg;
          argv.push(arg);
          break;
        }
        default:
          return tooComplex(child);
      }
    }
    commands.push({ argv, envVars: [], redirects: [], text: node.text });
    return null;
  }
  return tooComplex(node);
}
function walkTestExpr(node, argv, innerCommands, varScope) {
  switch (node.type) {
    case "unary_expression":
    case "binary_expression":
    case "negated_expression":
    case "parenthesized_expression": {
      for (const c of node.children) {
        if (!c) continue;
        const err = walkTestExpr(c, argv, innerCommands, varScope);
        if (err) return err;
      }
      return null;
    }
    case "test_operator":
    case "!":
    case "(":
    case ")":
    case "&&":
    case "||":
    case "==":
    case "=":
    case "!=":
    case "<":
    case ">":
    case "=~":
      argv.push(node.text);
      return null;
    case "regex":
    case "extglob_pattern":
      argv.push(node.text);
      return null;
    default: {
      const arg = walkArgument(node, innerCommands, varScope);
      if (typeof arg !== "string") return arg;
      argv.push(arg);
      return null;
    }
  }
}
function walkRedirectedStatement(node, commands, varScope) {
  const redirects = [];
  let innerCommand = null;
  for (const child of node.children) {
    if (!child) continue;
    if (child.type === "file_redirect") {
      const r = walkFileRedirect(child, commands, varScope);
      if ("kind" in r) return r;
      redirects.push(r);
    } else if (child.type === "heredoc_redirect") {
      const r = walkHeredocRedirect(child);
      if (r) return r;
    } else if (child.type === "command" || child.type === "pipeline" || child.type === "list" || child.type === "negated_command" || child.type === "declaration_command" || child.type === "unset_command") {
      innerCommand = child;
    } else {
      return tooComplex(child);
    }
  }
  if (!innerCommand) {
    commands.push({ argv: [], envVars: [], redirects, text: node.text });
    return null;
  }
  const before = commands.length;
  const err = collectCommands(innerCommand, commands, varScope);
  if (err) return err;
  if (commands.length > before && redirects.length > 0) {
    const last = commands[commands.length - 1];
    if (last) last.redirects.push(...redirects);
  }
  return null;
}
function walkFileRedirect(node, innerCommands, varScope) {
  let op = null;
  let target = null;
  let fd;
  for (const child of node.children) {
    if (!child) continue;
    if (child.type === "file_descriptor") {
      fd = Number(child.text);
    } else if (child.type in REDIRECT_OPS) {
      op = REDIRECT_OPS[child.type] ?? null;
    } else if (child.type === "word" || child.type === "number") {
      if (child.children.length > 0) return tooComplex(child);
      if (BRACE_EXPANSION_RE.test(child.text)) return tooComplex(child);
      target = child.text.replace(/\\(.)/g, "$1");
    } else if (child.type === "raw_string") {
      target = stripRawString(child.text);
    } else if (child.type === "string") {
      const s = walkString(child, innerCommands, varScope);
      if (typeof s !== "string") return s;
      target = s;
    } else if (child.type === "concatenation") {
      const s = walkArgument(child, innerCommands, varScope);
      if (typeof s !== "string") return s;
      target = s;
    } else {
      return tooComplex(child);
    }
  }
  if (!op || target === null) {
    return {
      kind: "too-complex",
      reason: "Unrecognized redirect shape",
      nodeType: node.type
    };
  }
  return { op, target, fd };
}
function walkHeredocRedirect(node) {
  let startText = null;
  let body = null;
  for (const child of node.children) {
    if (!child) continue;
    if (child.type === "heredoc_start") startText = child.text;
    else if (child.type === "heredoc_body") body = child;
    else if (child.type === "<<" || child.type === "<<-" || child.type === "heredoc_end" || child.type === "file_descriptor") {
    } else {
      return tooComplex(child);
    }
  }
  const isQuoted = startText !== null && (startText.startsWith("'") && startText.endsWith("'") || startText.startsWith('"') && startText.endsWith('"') || startText.startsWith("\\"));
  if (!isQuoted) {
    return {
      kind: "too-complex",
      reason: "Heredoc with unquoted delimiter undergoes shell expansion",
      nodeType: "heredoc_redirect"
    };
  }
  if (body) {
    for (const child of body.children) {
      if (!child) continue;
      if (child.type !== "heredoc_content") {
        return tooComplex(child);
      }
    }
  }
  return null;
}
function walkHerestringRedirect(node, innerCommands, varScope) {
  for (const child of node.children) {
    if (!child) continue;
    if (child.type === "<<<") continue;
    const content = walkArgument(child, innerCommands, varScope);
    if (typeof content !== "string") return content;
    if (NEWLINE_HASH_RE.test(content)) return tooComplex(child);
  }
  return null;
}
function walkCommand(node, extraRedirects, innerCommands, varScope) {
  const argv = [];
  const envVars = [];
  const redirects = [...extraRedirects];
  for (const child of node.children) {
    if (!child) continue;
    switch (child.type) {
      case "variable_assignment": {
        const ev = walkVariableAssignment(child, innerCommands, varScope);
        if ("kind" in ev) return ev;
        envVars.push({ name: ev.name, value: ev.value });
        break;
      }
      case "command_name": {
        const arg = walkArgument(
          child.children[0] ?? child,
          innerCommands,
          varScope
        );
        if (typeof arg !== "string") return arg;
        argv.push(arg);
        break;
      }
      case "word":
      case "number":
      case "raw_string":
      case "string":
      case "concatenation":
      case "arithmetic_expansion": {
        const arg = walkArgument(child, innerCommands, varScope);
        if (typeof arg !== "string") return arg;
        argv.push(arg);
        break;
      }
      // NOTE: command_substitution as a BARE argument (not inside a string)
      // is intentionally NOT handled here — the $() output IS the argument,
      // and for path-sensitive commands (cd, rm, chmod) the placeholder would
      // hide the real path from downstream checks. `cd $(echo /etc)` must
      // stay too-complex so the path-check can't be bypassed. $() inside
      // strings ("Timer: $(date)") is handled in walkString where the output
      // is embedded in a longer string (safer).
      case "simple_expansion": {
        const v = resolveSimpleExpansion(child, varScope, false);
        if (typeof v !== "string") return v;
        argv.push(v);
        break;
      }
      case "file_redirect": {
        const r = walkFileRedirect(child, innerCommands, varScope);
        if ("kind" in r) return r;
        redirects.push(r);
        break;
      }
      case "herestring_redirect": {
        const err = walkHerestringRedirect(child, innerCommands, varScope);
        if (err) return err;
        break;
      }
      default:
        return tooComplex(child);
    }
  }
  const text = /\$[A-Za-z_]/.test(node.text) || node.text.includes("\n") ? argv.map(
    (a) => a === "" || /["'\\ \t\n$`;|&<>(){}*?[\]~#]/.test(a) ? `'${a.replace(/'/g, "'\\''")}'` : a
  ).join(" ") : node.text;
  return {
    kind: "simple",
    commands: [{ argv, envVars, redirects, text }]
  };
}
function collectCommandSubstitution(csNode, innerCommands, varScope) {
  const innerScope = new Map(varScope);
  for (const child of csNode.children) {
    if (!child) continue;
    if (child.type === "$(" || child.type === "`" || child.type === ")") {
      continue;
    }
    const err = collectCommands(child, innerCommands, innerScope);
    if (err) return err;
  }
  return null;
}
function walkArgument(node, innerCommands, varScope) {
  if (!node) {
    return { kind: "too-complex", reason: "Null argument node" };
  }
  switch (node.type) {
    case "word": {
      if (BRACE_EXPANSION_RE.test(node.text)) {
        return {
          kind: "too-complex",
          reason: "Word contains brace expansion syntax",
          nodeType: "word"
        };
      }
      return node.text.replace(/\\(.)/g, "$1");
    }
    case "number":
      if (node.children.length > 0) {
        return {
          kind: "too-complex",
          reason: "Number node contains expansion (NN# arithmetic base syntax)",
          nodeType: node.children[0]?.type
        };
      }
      return node.text;
    case "raw_string":
      return stripRawString(node.text);
    case "string":
      return walkString(node, innerCommands, varScope);
    case "concatenation": {
      if (BRACE_EXPANSION_RE.test(node.text)) {
        return {
          kind: "too-complex",
          reason: "Brace expansion",
          nodeType: "concatenation"
        };
      }
      let result = "";
      for (const child of node.children) {
        if (!child) continue;
        const part = walkArgument(child, innerCommands, varScope);
        if (typeof part !== "string") return part;
        result += part;
      }
      return result;
    }
    case "arithmetic_expansion": {
      const err = walkArithmetic(node);
      if (err) return err;
      return node.text;
    }
    case "simple_expansion": {
      return resolveSimpleExpansion(node, varScope, false);
    }
    // NOTE: command_substitution at arg position (bare or inside concatenation)
    // is intentionally NOT handled — the output is/becomes-part-of a positional
    // argument which might be a path or flag. `rm $(foo)` or `rm $(foo)bar`
    // would hide the real path behind the placeholder. Only $() inside a
    // `string` node (walkString) is extracted, since the output is embedded
    // in a longer string rather than BEING the argument.
    default:
      return tooComplex(node);
  }
}
function walkString(node, innerCommands, varScope) {
  let result = "";
  let cursor = -1;
  let sawDynamicPlaceholder = false;
  let sawLiteralContent = false;
  for (const child of node.children) {
    if (!child) continue;
    if (cursor !== -1 && child.startIndex > cursor && child.type !== '"') {
      result += "\n".repeat(child.startIndex - cursor);
      sawLiteralContent = true;
    }
    cursor = child.endIndex;
    switch (child.type) {
      case '"':
        cursor = child.endIndex;
        break;
      case "string_content":
        result += child.text.replace(/\\([$`"\\])/g, "$1");
        sawLiteralContent = true;
        break;
      case DOLLAR:
        result += DOLLAR;
        sawLiteralContent = true;
        break;
      case "command_substitution": {
        const heredocBody = extractSafeCatHeredoc(child);
        if (heredocBody === "DANGEROUS") return tooComplex(child);
        if (heredocBody !== null) {
          const trimmed = heredocBody.replace(/\n+$/, "");
          if (trimmed.includes("\n")) {
            sawLiteralContent = true;
            break;
          }
          result += trimmed;
          sawLiteralContent = true;
          break;
        }
        const err = collectCommandSubstitution(child, innerCommands, varScope);
        if (err) return err;
        result += CMDSUB_PLACEHOLDER;
        sawDynamicPlaceholder = true;
        break;
      }
      case "simple_expansion": {
        const v = resolveSimpleExpansion(child, varScope, true);
        if (typeof v !== "string") return v;
        if (v === VAR_PLACEHOLDER) sawDynamicPlaceholder = true;
        else sawLiteralContent = true;
        result += v;
        break;
      }
      case "arithmetic_expansion": {
        const err = walkArithmetic(child);
        if (err) return err;
        result += child.text;
        sawLiteralContent = true;
        break;
      }
      default:
        return tooComplex(child);
    }
  }
  if (sawDynamicPlaceholder && !sawLiteralContent) {
    return tooComplex(node);
  }
  if (!sawLiteralContent && !sawDynamicPlaceholder && node.text.length > 2) {
    return tooComplex(node);
  }
  return result;
}
const ARITH_LEAF_RE = /^(?:[0-9]+|0[xX][0-9a-fA-F]+|[0-9]+#[0-9a-zA-Z]+|[-+*/%^&|~!<>=?:(),]+|<<|>>|\*\*|&&|\|\||[<>=!]=|\$\(\(|\)\))$/;
function walkArithmetic(node) {
  for (const child of node.children) {
    if (!child) continue;
    if (child.children.length === 0) {
      if (!ARITH_LEAF_RE.test(child.text)) {
        return {
          kind: "too-complex",
          reason: `Arithmetic expansion references variable or non-literal: ${child.text}`,
          nodeType: "arithmetic_expansion"
        };
      }
      continue;
    }
    switch (child.type) {
      case "binary_expression":
      case "unary_expression":
      case "ternary_expression":
      case "parenthesized_expression": {
        const err = walkArithmetic(child);
        if (err) return err;
        break;
      }
      default:
        return tooComplex(child);
    }
  }
  return null;
}
function extractSafeCatHeredoc(subNode) {
  let stmt = null;
  for (const child of subNode.children) {
    if (!child) continue;
    if (child.type === "$(" || child.type === ")") continue;
    if (child.type === "redirected_statement" && stmt === null) {
      stmt = child;
    } else {
      return null;
    }
  }
  if (!stmt) return null;
  let sawCat = false;
  let body = null;
  for (const child of stmt.children) {
    if (!child) continue;
    if (child.type === "command") {
      const cmdChildren = child.children.filter((c) => c);
      if (cmdChildren.length !== 1) return null;
      const nameNode = cmdChildren[0];
      if (nameNode?.type !== "command_name" || nameNode.text !== "cat") {
        return null;
      }
      sawCat = true;
    } else if (child.type === "heredoc_redirect") {
      if (walkHeredocRedirect(child) !== null) return null;
      for (const hc of child.children) {
        if (hc?.type === "heredoc_body") body = hc.text;
      }
    } else {
      return null;
    }
  }
  if (!sawCat || body === null) return null;
  if (PROC_ENVIRON_RE.test(body)) return "DANGEROUS";
  if (/\bsystem\s*\(/.test(body)) return "DANGEROUS";
  return body;
}
function walkVariableAssignment(node, innerCommands, varScope) {
  let name = null;
  let value = "";
  let isAppend = false;
  for (const child of node.children) {
    if (!child) continue;
    if (child.type === "variable_name") {
      name = child.text;
    } else if (child.type === "=" || child.type === "+=") {
      isAppend = child.type === "+=";
      continue;
    } else if (child.type === "command_substitution") {
      const err = collectCommandSubstitution(child, innerCommands, varScope);
      if (err) return err;
      value = CMDSUB_PLACEHOLDER;
    } else if (child.type === "simple_expansion") {
      const v = resolveSimpleExpansion(child, varScope, true);
      if (typeof v !== "string") return v;
      value = v;
    } else {
      const v = walkArgument(child, innerCommands, varScope);
      if (typeof v !== "string") return v;
      value = v;
    }
  }
  if (name === null) {
    return {
      kind: "too-complex",
      reason: "Variable assignment without name",
      nodeType: "variable_assignment"
    };
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return {
      kind: "too-complex",
      reason: `Invalid variable name (bash treats as command): ${name}`,
      nodeType: "variable_assignment"
    };
  }
  if (name === "IFS") {
    return {
      kind: "too-complex",
      reason: "IFS assignment changes word-splitting \u2014 cannot model statically",
      nodeType: "variable_assignment"
    };
  }
  if (name === "PS4") {
    if (isAppend) {
      return {
        kind: "too-complex",
        reason: "PS4 += cannot be statically verified \u2014 combine into a single PS4= assignment",
        nodeType: "variable_assignment"
      };
    }
    if (containsAnyPlaceholder(value)) {
      return {
        kind: "too-complex",
        reason: "PS4 value derived from cmdsub/variable \u2014 runtime unknowable",
        nodeType: "variable_assignment"
      };
    }
    if (!/^[A-Za-z0-9 _+:./=[\]-]*$/.test(
      value.replace(/\$\{[A-Za-z_][A-Za-z0-9_]*\}/g, "")
    )) {
      return {
        kind: "too-complex",
        reason: "PS4 value outside safe charset \u2014 only ${VAR} refs and [A-Za-z0-9 _+:.=/[]-] allowed",
        nodeType: "variable_assignment"
      };
    }
  }
  if (value.includes("~")) {
    return {
      kind: "too-complex",
      reason: "Tilde in assignment value \u2014 bash may expand at assignment time",
      nodeType: "variable_assignment"
    };
  }
  return { name, value, isAppend };
}
function resolveSimpleExpansion(node, varScope, insideString) {
  let varName = null;
  let isSpecial = false;
  for (const c of node.children) {
    if (c?.type === "variable_name") {
      varName = c.text;
      break;
    }
    if (c?.type === "special_variable_name") {
      varName = c.text;
      isSpecial = true;
      break;
    }
  }
  if (varName === null) return tooComplex(node);
  const trackedValue = varScope.get(varName);
  if (trackedValue !== void 0) {
    if (containsAnyPlaceholder(trackedValue)) {
      if (!insideString) return tooComplex(node);
      return VAR_PLACEHOLDER;
    }
    if (!insideString) {
      if (trackedValue === "") return tooComplex(node);
      if (BARE_VAR_UNSAFE_RE.test(trackedValue)) return tooComplex(node);
    }
    return trackedValue;
  }
  if (insideString) {
    if (SAFE_ENV_VARS.has(varName)) return VAR_PLACEHOLDER;
    if (isSpecial && (SPECIAL_VAR_NAMES.has(varName) || /^[0-9]+$/.test(varName))) {
      return VAR_PLACEHOLDER;
    }
  }
  return tooComplex(node);
}
function applyVarToScope(varScope, ev) {
  const existing = varScope.get(ev.name) ?? "";
  const combined = ev.isAppend ? existing + ev.value : ev.value;
  varScope.set(
    ev.name,
    containsAnyPlaceholder(combined) ? VAR_PLACEHOLDER : combined
  );
}
function stripRawString(text) {
  return text.slice(1, -1);
}
function tooComplex(node) {
  const reason = node.type === "ERROR" ? "Parse error" : DANGEROUS_TYPES.has(node.type) ? `Contains ${node.type}` : `Unhandled node type: ${node.type}`;
  return { kind: "too-complex", reason, nodeType: node.type };
}
const ZSH_DANGEROUS_BUILTINS = /* @__PURE__ */ new Set([
  "zmodload",
  "emulate",
  "sysopen",
  "sysread",
  "syswrite",
  "sysseek",
  "zpty",
  "ztcp",
  "zsocket",
  "zf_rm",
  "zf_mv",
  "zf_ln",
  "zf_chmod",
  "zf_chown",
  "zf_mkdir",
  "zf_rmdir",
  "zf_chgrp"
]);
const EVAL_LIKE_BUILTINS = /* @__PURE__ */ new Set([
  "eval",
  "source",
  ".",
  "exec",
  "command",
  "builtin",
  "fc",
  // `coproc rm -rf /` spawns rm as a coprocess. tree-sitter parses it as
  // a plain command with argv[0]='coproc', so permission rules and path
  // validation would check 'coproc' not 'rm'.
  "coproc",
  // Zsh precommand modifiers: `noglob cmd args` runs cmd with globbing off.
  // They parse as ordinary commands (noglob is argv[0], the real command is
  // argv[1]) so permission matching against argv[0] would see 'noglob', not
  // the wrapped command.
  "noglob",
  "nocorrect",
  // `trap 'cmd' SIGNAL` — cmd runs as shell code on signal/exit. EXIT fires
  // at end of every BashTool invocation, so this is guaranteed execution.
  "trap",
  // `enable -f /path/lib.so name` — dlopen arbitrary .so as a builtin.
  // Native code execution.
  "enable",
  // `mapfile -C callback -c N` / `readarray -C callback` — callback runs as
  // shell code every N input lines.
  "mapfile",
  "readarray",
  // `hash -p /path cmd` — poisons bash's command-lookup cache. Subsequent
  // `cmd` in the same command resolves to /path instead of PATH lookup.
  "hash",
  // `bind -x '"key":cmd'` / `complete -C cmd` — interactive-only callbacks
  // but still code-string arguments. Low impact in non-interactive BashTool
  // shells, blocked for consistency. `compgen -C cmd` is NOT interactive-only:
  // it immediately executes the -C argument to generate completions.
  "bind",
  "complete",
  "compgen",
  // `alias name='cmd'` — aliases not expanded in non-interactive bash by
  // default, but `shopt -s expand_aliases` enables them. Also blocked as
  // defense-in-depth (alias followed by name use in same command).
  "alias",
  // `let EXPR` arithmetically evaluates EXPR — identical to $(( EXPR )).
  // Array subscripts in the expression expand $(cmd) at eval time even when
  // the argument arrived single-quoted: `let 'x=a[$(id)]'` executes id.
  // tree-sitter sees the raw_string as an opaque leaf. Same primitive
  // walkArithmetic guards, but `let` is a plain command node.
  "let"
]);
const SUBSCRIPT_EVAL_FLAGS = {
  test: /* @__PURE__ */ new Set(["-v", "-R"]),
  "[": /* @__PURE__ */ new Set(["-v", "-R"]),
  "[[": /* @__PURE__ */ new Set(["-v", "-R"]),
  printf: /* @__PURE__ */ new Set(["-v"]),
  read: /* @__PURE__ */ new Set(["-a"]),
  unset: /* @__PURE__ */ new Set(["-v"]),
  // bash 5.1+: `wait -p VAR [id...]` stores the waited PID into VAR. When VAR
  // is `arr[EXPR]`, bash arithmetically evaluates the subscript — running
  // $(cmd) even from a single-quoted raw_string. Verified bash 5.3.9:
  // `: & wait -p 'a[$(id)]' %1` executes id.
  wait: /* @__PURE__ */ new Set(["-p"])
};
const TEST_ARITH_CMP_OPS = /* @__PURE__ */ new Set(["-eq", "-ne", "-lt", "-le", "-gt", "-ge"]);
const BARE_SUBSCRIPT_NAME_BUILTINS = /* @__PURE__ */ new Set(["read", "unset"]);
const READ_DATA_FLAGS = /* @__PURE__ */ new Set(["-p", "-d", "-n", "-N", "-t", "-u", "-i"]);
const PROC_ENVIRON_RE = /\/proc\/.*\/environ/;
const NEWLINE_HASH_RE = /\n[ \t]*#/;
function checkSemantics(commands) {
  for (const cmd of commands) {
    let a = cmd.argv;
    for (; ; ) {
      if (a[0] === "time" || a[0] === "nohup") {
        a = a.slice(1);
      } else if (a[0] === "timeout") {
        let i = 1;
        while (i < a.length) {
          const arg = a[i];
          if (arg === "--foreground" || arg === "--preserve-status" || arg === "--verbose") {
            i++;
          } else if (/^--(?:kill-after|signal)=[A-Za-z0-9_.+-]+$/.test(arg)) {
            i++;
          } else if ((arg === "--kill-after" || arg === "--signal") && a[i + 1] && /^[A-Za-z0-9_.+-]+$/.test(a[i + 1])) {
            i += 2;
          } else if (arg.startsWith("--")) {
            return {
              ok: false,
              reason: `timeout with ${arg} flag cannot be statically analyzed`
            };
          } else if (arg === "-v") {
            i++;
          } else if ((arg === "-k" || arg === "-s") && a[i + 1] && /^[A-Za-z0-9_.+-]+$/.test(a[i + 1])) {
            i += 2;
          } else if (/^-[ks][A-Za-z0-9_.+-]+$/.test(arg)) {
            i++;
          } else if (arg.startsWith("-")) {
            return {
              ok: false,
              reason: `timeout with ${arg} flag cannot be statically analyzed`
            };
          } else {
            break;
          }
        }
        if (a[i] && /^\d+(?:\.\d+)?[smhd]?$/.test(a[i])) {
          a = a.slice(i + 1);
        } else if (a[i]) {
          return {
            ok: false,
            reason: `timeout duration '${a[i]}' cannot be statically analyzed`
          };
        } else {
          break;
        }
      } else if (a[0] === "nice") {
        if (a[1] === "-n" && a[2] && /^-?\d+$/.test(a[2])) {
          a = a.slice(3);
        } else if (a[1] && /^-\d+$/.test(a[1])) {
          a = a.slice(2);
        } else if (a[1] && /[$(`]/.test(a[1])) {
          return {
            ok: false,
            reason: `nice argument '${a[1]}' contains expansion \u2014 cannot statically determine wrapped command`
          };
        } else {
          a = a.slice(1);
        }
      } else if (a[0] === "env") {
        let i = 1;
        while (i < a.length) {
          const arg = a[i];
          if (arg.includes("=") && !arg.startsWith("-")) {
            i++;
          } else if (arg === "-i" || arg === "-0" || arg === "-v") {
            i++;
          } else if (arg === "-u" && a[i + 1]) {
            i += 2;
          } else if (arg.startsWith("-")) {
            return {
              ok: false,
              reason: `env with ${arg} flag cannot be statically analyzed`
            };
          } else {
            break;
          }
        }
        if (i < a.length) {
          a = a.slice(i);
        } else {
          break;
        }
      } else if (a[0] === "stdbuf") {
        let i = 1;
        while (i < a.length) {
          const arg = a[i];
          if (STDBUF_SHORT_SEP_RE.test(arg) && a[i + 1]) {
            i += 2;
          } else if (STDBUF_SHORT_FUSED_RE.test(arg)) {
            i++;
          } else if (STDBUF_LONG_RE.test(arg)) {
            i++;
          } else if (arg.startsWith("-")) {
            return {
              ok: false,
              reason: `stdbuf with ${arg} flag cannot be statically analyzed`
            };
          } else {
            break;
          }
        }
        if (i > 1 && i < a.length) {
          a = a.slice(i);
        } else {
          break;
        }
      } else {
        break;
      }
    }
    const name = a[0];
    if (name === void 0) continue;
    if (name === "") {
      return {
        ok: false,
        reason: "Empty command name \u2014 argv[0] may not reflect what bash runs"
      };
    }
    if (name.includes(CMDSUB_PLACEHOLDER) || name.includes(VAR_PLACEHOLDER)) {
      return {
        ok: false,
        reason: "Command name is runtime-determined (placeholder argv[0])"
      };
    }
    if (name.startsWith("-") || name.startsWith("|") || name.startsWith("&")) {
      return {
        ok: false,
        reason: "Command appears to be an incomplete fragment"
      };
    }
    const dangerFlags = SUBSCRIPT_EVAL_FLAGS[name];
    if (dangerFlags !== void 0) {
      for (let i = 1; i < a.length; i++) {
        const arg = a[i];
        if (dangerFlags.has(arg) && a[i + 1]?.includes("[")) {
          return {
            ok: false,
            reason: `'${name} ${arg}' operand contains array subscript \u2014 bash evaluates $(cmd) in subscripts`
          };
        }
        if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-" && !arg.includes("[")) {
          for (const flag of dangerFlags) {
            if (flag.length === 2 && arg.includes(flag[1])) {
              if (a[i + 1]?.includes("[")) {
                return {
                  ok: false,
                  reason: `'${name} ${flag}' (combined in '${arg}') operand contains array subscript \u2014 bash evaluates $(cmd) in subscripts`
                };
              }
            }
          }
        }
        for (const flag of dangerFlags) {
          if (flag.length === 2 && arg.startsWith(flag) && arg.length > 2 && arg.includes("[")) {
            return {
              ok: false,
              reason: `'${name} ${flag}' (fused) operand contains array subscript \u2014 bash evaluates $(cmd) in subscripts`
            };
          }
        }
      }
    }
    if (name === "[[") {
      for (let i = 2; i < a.length; i++) {
        if (!TEST_ARITH_CMP_OPS.has(a[i])) continue;
        if (a[i - 1]?.includes("[") || a[i + 1]?.includes("[")) {
          return {
            ok: false,
            reason: `'[[ ... ${a[i]} ... ]]' operand contains array subscript \u2014 bash arithmetically evaluates $(cmd) in subscripts`
          };
        }
      }
    }
    if (BARE_SUBSCRIPT_NAME_BUILTINS.has(name)) {
      let skipNext = false;
      for (let i = 1; i < a.length; i++) {
        const arg = a[i];
        if (skipNext) {
          skipNext = false;
          continue;
        }
        if (arg[0] === "-") {
          if (name === "read") {
            if (READ_DATA_FLAGS.has(arg)) {
              skipNext = true;
            } else if (arg.length > 2 && arg[1] !== "-") {
              for (let j = 1; j < arg.length; j++) {
                if (READ_DATA_FLAGS.has("-" + arg[j])) {
                  if (j === arg.length - 1) skipNext = true;
                  break;
                }
              }
            }
          }
          continue;
        }
        if (arg.includes("[")) {
          return {
            ok: false,
            reason: `'${name}' positional NAME '${arg}' contains array subscript \u2014 bash evaluates $(cmd) in subscripts`
          };
        }
      }
    }
    if (SHELL_KEYWORDS.has(name)) {
      return {
        ok: false,
        reason: `Shell keyword '${name}' as command name \u2014 tree-sitter mis-parse`
      };
    }
    for (const arg of cmd.argv) {
      if (arg.includes("\n") && NEWLINE_HASH_RE.test(arg)) {
        return {
          ok: false,
          reason: "Newline followed by # inside a quoted argument can hide arguments from path validation"
        };
      }
    }
    for (const ev of cmd.envVars) {
      if (ev.value.includes("\n") && NEWLINE_HASH_RE.test(ev.value)) {
        return {
          ok: false,
          reason: "Newline followed by # inside an env var value can hide arguments from path validation"
        };
      }
    }
    for (const r of cmd.redirects) {
      if (r.target.includes("\n") && NEWLINE_HASH_RE.test(r.target)) {
        return {
          ok: false,
          reason: "Newline followed by # inside a redirect target can hide arguments from path validation"
        };
      }
    }
    if (name === "jq") {
      for (const arg of a) {
        if (/\bsystem\s*\(/.test(arg)) {
          return {
            ok: false,
            reason: "jq command contains system() function which executes arbitrary commands"
          };
        }
      }
      if (a.some(
        (arg) => /^(?:-[fL](?:$|[^A-Za-z])|--(?:from-file|rawfile|slurpfile|library-path)(?:$|=))/.test(
          arg
        )
      )) {
        return {
          ok: false,
          reason: "jq command contains dangerous flags that could execute code or read arbitrary files"
        };
      }
    }
    if (ZSH_DANGEROUS_BUILTINS.has(name)) {
      return {
        ok: false,
        reason: `Zsh builtin '${name}' can bypass security checks`
      };
    }
    if (EVAL_LIKE_BUILTINS.has(name)) {
      if (name === "command" && (a[1] === "-v" || a[1] === "-V")) {
      } else if (name === "fc" && !a.slice(1).some((arg) => /^-[^-]*[es]/.test(arg))) {
      } else if (name === "compgen" && !a.slice(1).some((arg) => /^-[^-]*[CFW]/.test(arg))) {
      } else {
        return {
          ok: false,
          reason: `'${name}' evaluates arguments as shell code`
        };
      }
    }
    for (const arg of cmd.argv) {
      if (arg.includes("/proc/") && PROC_ENVIRON_RE.test(arg)) {
        return {
          ok: false,
          reason: "Accesses /proc/*/environ which may expose secrets"
        };
      }
    }
    for (const r of cmd.redirects) {
      if (r.target.includes("/proc/") && PROC_ENVIRON_RE.test(r.target)) {
        return {
          ok: false,
          reason: "Accesses /proc/*/environ which may expose secrets"
        };
      }
    }
  }
  return { ok: true };
}
export {
  checkSemantics,
  nodeTypeId,
  parseForSecurity,
  parseForSecurityFromAst
};
