function collectQuoteSpans(node, out, inDouble) {
  switch (node.type) {
    case "raw_string":
      out.raw.push([node.startIndex, node.endIndex]);
      return;
    // literal body, no nested quotes possible
    case "ansi_c_string":
      out.ansiC.push([node.startIndex, node.endIndex]);
      return;
    // literal body
    case "string":
      if (!inDouble) out.double.push([node.startIndex, node.endIndex]);
      for (const child of node.children) {
        if (child) collectQuoteSpans(child, out, true);
      }
      return;
    case "heredoc_redirect": {
      let isQuoted = false;
      for (const child of node.children) {
        if (child && child.type === "heredoc_start") {
          const first = child.text[0];
          isQuoted = first === "'" || first === '"' || first === "\\";
          break;
        }
      }
      if (isQuoted) {
        out.heredoc.push([node.startIndex, node.endIndex]);
        return;
      }
      break;
    }
  }
  for (const child of node.children) {
    if (child) collectQuoteSpans(child, out, inDouble);
  }
}
function buildPositionSet(spans) {
  const set = /* @__PURE__ */ new Set();
  for (const [start, end] of spans) {
    for (let i = start; i < end; i++) {
      set.add(i);
    }
  }
  return set;
}
function dropContainedSpans(spans) {
  return spans.filter(
    (s, i) => !spans.some(
      (other, j) => j !== i && other[0] <= s[0] && other[1] >= s[1] && (other[0] < s[0] || other[1] > s[1])
    )
  );
}
function removeSpans(command, spans) {
  if (spans.length === 0) return command;
  const sorted = dropContainedSpans(spans).sort((a, b) => b[0] - a[0]);
  let result = command;
  for (const [start, end] of sorted) {
    result = result.slice(0, start) + result.slice(end);
  }
  return result;
}
function replaceSpansKeepQuotes(command, spans) {
  if (spans.length === 0) return command;
  const sorted = dropContainedSpans(spans).sort((a, b) => b[0] - a[0]);
  let result = command;
  for (const [start, end, open, close] of sorted) {
    result = result.slice(0, start) + open + close + result.slice(end);
  }
  return result;
}
function extractQuoteContext(rootNode, command) {
  const spans = { raw: [], ansiC: [], double: [], heredoc: [] };
  collectQuoteSpans(rootNode, spans, false);
  const singleQuoteSpans = spans.raw;
  const ansiCSpans = spans.ansiC;
  const doubleQuoteSpans = spans.double;
  const quotedHeredocSpans = spans.heredoc;
  const allQuoteSpans = [
    ...singleQuoteSpans,
    ...ansiCSpans,
    ...doubleQuoteSpans,
    ...quotedHeredocSpans
  ];
  const singleQuoteSet = buildPositionSet([
    ...singleQuoteSpans,
    ...ansiCSpans,
    ...quotedHeredocSpans
  ]);
  const doubleQuoteDelimSet = /* @__PURE__ */ new Set();
  for (const [start, end] of doubleQuoteSpans) {
    doubleQuoteDelimSet.add(start);
    doubleQuoteDelimSet.add(end - 1);
  }
  let withDoubleQuotes = "";
  for (let i = 0; i < command.length; i++) {
    if (singleQuoteSet.has(i)) continue;
    if (doubleQuoteDelimSet.has(i)) continue;
    withDoubleQuotes += command[i];
  }
  const fullyUnquoted = removeSpans(command, allQuoteSpans);
  const spansWithQuoteChars = [];
  for (const [start, end] of singleQuoteSpans) {
    spansWithQuoteChars.push([start, end, "'", "'"]);
  }
  for (const [start, end] of ansiCSpans) {
    spansWithQuoteChars.push([start, end, "$'", "'"]);
  }
  for (const [start, end] of doubleQuoteSpans) {
    spansWithQuoteChars.push([start, end, '"', '"']);
  }
  for (const [start, end] of quotedHeredocSpans) {
    spansWithQuoteChars.push([start, end, "", ""]);
  }
  const unquotedKeepQuoteChars = replaceSpansKeepQuotes(
    command,
    spansWithQuoteChars
  );
  return { withDoubleQuotes, fullyUnquoted, unquotedKeepQuoteChars };
}
function extractCompoundStructure(rootNode, command) {
  const n = rootNode;
  const operators = [];
  const segments = [];
  let hasSubshell = false;
  let hasCommandGroup = false;
  let hasPipeline = false;
  function walkTopLevel(node) {
    for (const child of node.children) {
      if (!child) continue;
      if (child.type === "list") {
        for (const listChild of child.children) {
          if (!listChild) continue;
          if (listChild.type === "&&" || listChild.type === "||") {
            operators.push(listChild.type);
          } else if (listChild.type === "list" || listChild.type === "redirected_statement") {
            walkTopLevel({ ...node, children: [listChild] });
          } else if (listChild.type === "pipeline") {
            hasPipeline = true;
            segments.push(listChild.text);
          } else if (listChild.type === "subshell") {
            hasSubshell = true;
            segments.push(listChild.text);
          } else if (listChild.type === "compound_statement") {
            hasCommandGroup = true;
            segments.push(listChild.text);
          } else {
            segments.push(listChild.text);
          }
        }
      } else if (child.type === ";") {
        operators.push(";");
      } else if (child.type === "pipeline") {
        hasPipeline = true;
        segments.push(child.text);
      } else if (child.type === "subshell") {
        hasSubshell = true;
        segments.push(child.text);
      } else if (child.type === "compound_statement") {
        hasCommandGroup = true;
        segments.push(child.text);
      } else if (child.type === "command" || child.type === "declaration_command" || child.type === "variable_assignment") {
        segments.push(child.text);
      } else if (child.type === "redirected_statement") {
        let foundInner = false;
        for (const inner of child.children) {
          if (!inner || inner.type === "file_redirect") continue;
          foundInner = true;
          walkTopLevel({ ...child, children: [inner] });
        }
        if (!foundInner) {
          segments.push(child.text);
        }
      } else if (child.type === "negated_command") {
        segments.push(child.text);
        walkTopLevel(child);
      } else if (child.type === "if_statement" || child.type === "while_statement" || child.type === "for_statement" || child.type === "case_statement" || child.type === "function_definition") {
        segments.push(child.text);
        walkTopLevel(child);
      }
    }
  }
  walkTopLevel(n);
  if (segments.length === 0) {
    segments.push(command);
  }
  return {
    hasCompoundOperators: operators.length > 0,
    hasPipeline,
    hasSubshell,
    hasCommandGroup,
    operators,
    segments
  };
}
function hasActualOperatorNodes(rootNode) {
  const n = rootNode;
  function walk(node) {
    if (node.type === ";" || node.type === "&&" || node.type === "||") {
      return true;
    }
    if (node.type === "list") {
      return true;
    }
    for (const child of node.children) {
      if (child && walk(child)) return true;
    }
    return false;
  }
  return walk(n);
}
function extractDangerousPatterns(rootNode) {
  const n = rootNode;
  let hasCommandSubstitution = false;
  let hasProcessSubstitution = false;
  let hasParameterExpansion = false;
  let hasHeredoc = false;
  let hasComment = false;
  function walk(node) {
    switch (node.type) {
      case "command_substitution":
        hasCommandSubstitution = true;
        break;
      case "process_substitution":
        hasProcessSubstitution = true;
        break;
      case "expansion":
        hasParameterExpansion = true;
        break;
      case "heredoc_redirect":
        hasHeredoc = true;
        break;
      case "comment":
        hasComment = true;
        break;
    }
    for (const child of node.children) {
      if (child) walk(child);
    }
  }
  walk(n);
  return {
    hasCommandSubstitution,
    hasProcessSubstitution,
    hasParameterExpansion,
    hasHeredoc,
    hasComment
  };
}
function analyzeCommand(rootNode, command) {
  return {
    quoteContext: extractQuoteContext(rootNode, command),
    compoundStructure: extractCompoundStructure(rootNode, command),
    hasActualOperatorNodes: hasActualOperatorNodes(rootNode),
    dangerousPatterns: extractDangerousPatterns(rootNode)
  };
}
export {
  analyzeCommand,
  extractCompoundStructure,
  extractDangerousPatterns,
  extractQuoteContext,
  hasActualOperatorNodes
};
