import { execa } from "execa";
import { logForDebugging } from "../debug.js";
import { memoizeWithLRU } from "../memoize.js";
import { getCachedPowerShellPath } from "../shell/powershellDetection.js";
import { jsonParse } from "../slowOperations.js";
const DEFAULT_PARSE_TIMEOUT_MS = 5e3;
function getParseTimeoutMs() {
  const env = process.env.CLAUDE_CODE_PWSH_PARSE_TIMEOUT_MS;
  if (env) {
    const parsed = parseInt(env, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_PARSE_TIMEOUT_MS;
}
const PARSE_SCRIPT_BODY = `
if (-not $EncodedCommand) {
    Write-Output '{"valid":false,"errors":[{"message":"No command provided","errorId":"NoInput"}],"statements":[],"variables":[],"hasStopParsing":false,"originalCommand":""}'
    exit 0
}

$Command = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($EncodedCommand))

$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput(
    $Command,
    [ref]$tokens,
    [ref]$parseErrors
)

$allVariables = [System.Collections.ArrayList]::new()

function Get-RawCommandElements {
    param([System.Management.Automation.Language.CommandAst]$CmdAst)
    $elems = [System.Collections.ArrayList]::new()
    foreach ($ce in $CmdAst.CommandElements) {
        $ceData = @{ type = $ce.GetType().Name; text = $ce.Extent.Text }
        if ($ce.PSObject.Properties['Value'] -and $null -ne $ce.Value -and $ce.Value -is [string]) {
            $ceData.value = $ce.Value
        }
        if ($ce -is [System.Management.Automation.Language.CommandExpressionAst]) {
            $ceData.expressionType = $ce.Expression.GetType().Name
        }
        $a=$ce.Argument;if($a){$ceData.children=@(@{type=$a.GetType().Name;text=$a.Extent.Text})}
        [void]$elems.Add($ceData)
    }
    return $elems
}

function Get-RawRedirections {
    param($Redirections)
    $result = [System.Collections.ArrayList]::new()
    foreach ($redir in $Redirections) {
        $redirData = @{ type = $redir.GetType().Name }
        if ($redir -is [System.Management.Automation.Language.FileRedirectionAst]) {
            $redirData.append = [bool]$redir.Append
            $redirData.fromStream = $redir.FromStream.ToString()
            $redirData.locationText = $redir.Location.Extent.Text
        }
        [void]$result.Add($redirData)
    }
    return $result
}

function Get-SecurityPatterns($A) {
    $p = @{}
    foreach ($n in $A.FindAll({ param($x)
        $x -is [System.Management.Automation.Language.MemberExpressionAst] -or
        $x -is [System.Management.Automation.Language.SubExpressionAst] -or
        $x -is [System.Management.Automation.Language.ArrayExpressionAst] -or
        $x -is [System.Management.Automation.Language.ExpandableStringExpressionAst] -or
        $x -is [System.Management.Automation.Language.ScriptBlockExpressionAst] -or
        $x -is [System.Management.Automation.Language.ParenExpressionAst]
    }, $true)) { switch ($n.GetType().Name) {
        'InvokeMemberExpressionAst' { $p.hasMemberInvocations = $true }
        'MemberExpressionAst' { $p.hasMemberInvocations = $true }
        'SubExpressionAst' { $p.hasSubExpressions = $true }
        'ArrayExpressionAst' { $p.hasSubExpressions = $true }
        'ParenExpressionAst' { $p.hasSubExpressions = $true }
        'ExpandableStringExpressionAst' { $p.hasExpandableStrings = $true }
        'ScriptBlockExpressionAst' { $p.hasScriptBlocks = $true }
    }}
    if ($p.Count -gt 0) { return $p }
    return $null
}

$varExprs = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.VariableExpressionAst] }, $true)
foreach ($v in $varExprs) {
    [void]$allVariables.Add(@{
        path = $v.VariablePath.ToString()
        isSplatted = [bool]$v.Splatted
    })
}

$typeLiterals = [System.Collections.ArrayList]::new()
foreach ($t in $ast.FindAll({ param($n)
    $n -is [System.Management.Automation.Language.TypeExpressionAst] -or
    $n -is [System.Management.Automation.Language.TypeConstraintAst]
}, $true)) { [void]$typeLiterals.Add($t.TypeName.FullName) }

$hasStopParsing = $false
$tk = [System.Management.Automation.Language.TokenKind]
foreach ($tok in $tokens) {
    if ($tok.Kind -eq $tk::MinusMinus) { $hasStopParsing = $true; break }
    if ($tok.Kind -eq $tk::Generic -and ($tok.Text -replace '[\u2013\u2014\u2015]','-') -eq '--%') {
        $hasStopParsing = $true; break
    }
}

$statements = [System.Collections.ArrayList]::new()

function Process-BlockStatements {
    param($Block)
    if (-not $Block) { return }

    foreach ($stmt in $Block.Statements) {
        $statement = @{
            type = $stmt.GetType().Name
            text = $stmt.Extent.Text
        }

        if ($stmt -is [System.Management.Automation.Language.PipelineAst]) {
            $elements = [System.Collections.ArrayList]::new()
            foreach ($element in $stmt.PipelineElements) {
                $elemData = @{
                    type = $element.GetType().Name
                    text = $element.Extent.Text
                }

                if ($element -is [System.Management.Automation.Language.CommandAst]) {
                    $elemData.commandElements = @(Get-RawCommandElements -CmdAst $element)
                    $elemData.redirections = @(Get-RawRedirections -Redirections $element.Redirections)
                } elseif ($element -is [System.Management.Automation.Language.CommandExpressionAst]) {
                    $elemData.expressionType = $element.Expression.GetType().Name
                    $elemData.redirections = @(Get-RawRedirections -Redirections $element.Redirections)
                }

                [void]$elements.Add($elemData)
            }
            $statement.elements = @($elements)

            $allNestedCmds = $stmt.FindAll(
                { param($node) $node -is [System.Management.Automation.Language.CommandAst] },
                $true
            )
            $nestedCmds = [System.Collections.ArrayList]::new()
            foreach ($cmd in $allNestedCmds) {
                if ($cmd.Parent -eq $stmt) { continue }
                $nested = @{
                    type = $cmd.GetType().Name
                    text = $cmd.Extent.Text
                    commandElements = @(Get-RawCommandElements -CmdAst $cmd)
                    redirections = @(Get-RawRedirections -Redirections $cmd.Redirections)
                }
                [void]$nestedCmds.Add($nested)
            }
            if ($nestedCmds.Count -gt 0) {
                $statement.nestedCommands = @($nestedCmds)
            }
            $r = $stmt.FindAll({param($n) $n -is [System.Management.Automation.Language.FileRedirectionAst]}, $true)
            if ($r.Count -gt 0) {
                $rr = @(Get-RawRedirections -Redirections $r)
                $statement.redirections = if ($statement.redirections) { @($statement.redirections) + $rr } else { $rr }
            }
        } else {
            $nestedCmdAsts = $stmt.FindAll(
                { param($node) $node -is [System.Management.Automation.Language.CommandAst] },
                $true
            )
            $nested = [System.Collections.ArrayList]::new()
            foreach ($cmd in $nestedCmdAsts) {
                [void]$nested.Add(@{
                    type = 'CommandAst'
                    text = $cmd.Extent.Text
                    commandElements = @(Get-RawCommandElements -CmdAst $cmd)
                    redirections = @(Get-RawRedirections -Redirections $cmd.Redirections)
                })
            }
            if ($nested.Count -gt 0) {
                $statement.nestedCommands = @($nested)
            }
            $r = $stmt.FindAll({param($n) $n -is [System.Management.Automation.Language.FileRedirectionAst]}, $true)
            if ($r.Count -gt 0) { $statement.redirections = @(Get-RawRedirections -Redirections $r) }
        }

        $sp = Get-SecurityPatterns $stmt
        if ($sp) { $statement.securityPatterns = $sp }

        [void]$statements.Add($statement)
    }

    if ($Block.Traps) {
        foreach ($trap in $Block.Traps) {
            $statement = @{
                type = 'TrapStatementAst'
                text = $trap.Extent.Text
            }
            $nestedCmdAsts = $trap.FindAll(
                { param($node) $node -is [System.Management.Automation.Language.CommandAst] },
                $true
            )
            $nestedCmds = [System.Collections.ArrayList]::new()
            foreach ($cmd in $nestedCmdAsts) {
                $nested = @{
                    type = $cmd.GetType().Name
                    text = $cmd.Extent.Text
                    commandElements = @(Get-RawCommandElements -CmdAst $cmd)
                    redirections = @(Get-RawRedirections -Redirections $cmd.Redirections)
                }
                [void]$nestedCmds.Add($nested)
            }
            if ($nestedCmds.Count -gt 0) {
                $statement.nestedCommands = @($nestedCmds)
            }
            $r = $trap.FindAll({param($n) $n -is [System.Management.Automation.Language.FileRedirectionAst]}, $true)
            if ($r.Count -gt 0) { $statement.redirections = @(Get-RawRedirections -Redirections $r) }
            $sp = Get-SecurityPatterns $trap
            if ($sp) { $statement.securityPatterns = $sp }
            [void]$statements.Add($statement)
        }
    }
}

Process-BlockStatements -Block $ast.BeginBlock
Process-BlockStatements -Block $ast.ProcessBlock
Process-BlockStatements -Block $ast.EndBlock
Process-BlockStatements -Block $ast.CleanBlock
Process-BlockStatements -Block $ast.DynamicParamBlock

if ($ast.ParamBlock) {
  $pb = $ast.ParamBlock
  $pn = [System.Collections.ArrayList]::new()
  foreach ($c in $pb.FindAll({param($n) $n -is [System.Management.Automation.Language.CommandAst]}, $true)) {
    [void]$pn.Add(@{type='CommandAst';text=$c.Extent.Text;commandElements=@(Get-RawCommandElements -CmdAst $c);redirections=@(Get-RawRedirections -Redirections $c.Redirections)})
  }
  $pr = $pb.FindAll({param($n) $n -is [System.Management.Automation.Language.FileRedirectionAst]}, $true)
  $ps = Get-SecurityPatterns $pb
  if ($pn.Count -gt 0 -or $pr.Count -gt 0 -or $ps) {
    $st = @{type='ParamBlockAst';text=$pb.Extent.Text}
    if ($pn.Count -gt 0) { $st.nestedCommands = @($pn) }
    if ($pr.Count -gt 0) { $st.redirections = @(Get-RawRedirections -Redirections $pr) }
    if ($ps) { $st.securityPatterns = $ps }
    [void]$statements.Add($st)
  }
}

$hasUsingStatements = $ast.UsingStatements -and $ast.UsingStatements.Count -gt 0
$hasScriptRequirements = $ast.ScriptRequirements -ne $null

$output = @{
    valid = ($parseErrors.Count -eq 0)
    errors = @($parseErrors | ForEach-Object {
        @{
            message = $_.Message
            errorId = $_.ErrorId
        }
    })
    statements = @($statements)
    variables = @($allVariables)
    hasStopParsing = $hasStopParsing
    originalCommand = $Command
    typeLiterals = @($typeLiterals)
    hasUsingStatements = [bool]$hasUsingStatements
    hasScriptRequirements = [bool]$hasScriptRequirements
}

$output | ConvertTo-Json -Depth 10 -Compress
`;
const WINDOWS_ARGV_CAP = 32767;
const FIXED_ARGV_OVERHEAD = 200;
const ENCODED_CMD_WRAPPER = `$EncodedCommand = ''
`.length;
const SAFETY_MARGIN = 100;
const SCRIPT_CHARS_BUDGET = (WINDOWS_ARGV_CAP - FIXED_ARGV_OVERHEAD) * 3 / 8;
const CMD_B64_BUDGET = SCRIPT_CHARS_BUDGET - PARSE_SCRIPT_BODY.length - ENCODED_CMD_WRAPPER;
const WINDOWS_MAX_COMMAND_LENGTH = Math.max(
  0,
  Math.floor(CMD_B64_BUDGET * 3 / 4) - SAFETY_MARGIN
);
const UNIX_MAX_COMMAND_LENGTH = 4500;
const MAX_COMMAND_LENGTH = process.platform === "win32" ? WINDOWS_MAX_COMMAND_LENGTH : UNIX_MAX_COMMAND_LENGTH;
const INVALID_RESULT_BASE = {
  valid: false,
  statements: [],
  variables: [],
  hasStopParsing: false
};
function makeInvalidResult(command, message, errorId) {
  return {
    ...INVALID_RESULT_BASE,
    errors: [{ message, errorId }],
    originalCommand: command
  };
}
function toUtf16LeBase64(text) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(text, "utf16le").toString("base64");
  }
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes.push(code & 255, code >> 8 & 255);
  }
  return btoa(bytes.map((b) => String.fromCharCode(b)).join(""));
}
function buildParseScript(command) {
  const encoded = typeof Buffer !== "undefined" ? Buffer.from(command, "utf8").toString("base64") : btoa(
    new TextEncoder().encode(command).reduce((s, b) => s + String.fromCharCode(b), "")
  );
  return `$EncodedCommand = '${encoded}'
${PARSE_SCRIPT_BODY}`;
}
function ensureArray(value) {
  if (value === void 0 || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}
function mapStatementType(rawType) {
  switch (rawType) {
    case "PipelineAst":
      return "PipelineAst";
    case "PipelineChainAst":
      return "PipelineChainAst";
    case "AssignmentStatementAst":
      return "AssignmentStatementAst";
    case "IfStatementAst":
      return "IfStatementAst";
    case "ForStatementAst":
      return "ForStatementAst";
    case "ForEachStatementAst":
      return "ForEachStatementAst";
    case "WhileStatementAst":
      return "WhileStatementAst";
    case "DoWhileStatementAst":
      return "DoWhileStatementAst";
    case "DoUntilStatementAst":
      return "DoUntilStatementAst";
    case "SwitchStatementAst":
      return "SwitchStatementAst";
    case "TryStatementAst":
      return "TryStatementAst";
    case "TrapStatementAst":
      return "TrapStatementAst";
    case "FunctionDefinitionAst":
      return "FunctionDefinitionAst";
    case "DataStatementAst":
      return "DataStatementAst";
    default:
      return "UnknownStatementAst";
  }
}
function mapElementType(rawType, expressionType) {
  switch (rawType) {
    case "ScriptBlockExpressionAst":
      return "ScriptBlock";
    case "SubExpressionAst":
    case "ArrayExpressionAst":
      return "SubExpression";
    case "ExpandableStringExpressionAst":
      return "ExpandableString";
    case "InvokeMemberExpressionAst":
    case "MemberExpressionAst":
      return "MemberInvocation";
    case "VariableExpressionAst":
      return "Variable";
    case "StringConstantExpressionAst":
    case "ConstantExpressionAst":
      return "StringConstant";
    case "CommandParameterAst":
      return "Parameter";
    case "ParenExpressionAst":
      return "SubExpression";
    case "CommandExpressionAst":
      if (expressionType) {
        return mapElementType(expressionType);
      }
      return "Other";
    default:
      return "Other";
  }
}
function classifyCommandName(name) {
  if (/^[A-Za-z]+-[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
    return "cmdlet";
  }
  if (/[.\\/]/.test(name)) {
    return "application";
  }
  return "unknown";
}
function stripModulePrefix(name) {
  const idx = name.lastIndexOf("\\");
  if (idx < 0) return name;
  if (/^[A-Za-z]:/.test(name) || name.startsWith("\\\\") || name.startsWith(".\\") || name.startsWith("..\\"))
    return name;
  return name.substring(idx + 1);
}
function transformCommandAst(raw) {
  const cmdElements = ensureArray(raw.commandElements);
  let name = "";
  const args = [];
  const elementTypes = [];
  const children = [];
  let hasChildren = false;
  let nameType = "unknown";
  if (cmdElements.length > 0) {
    const first = cmdElements[0];
    const isFirstStringLiteral = first.type === "StringConstantExpressionAst" || first.type === "ExpandableStringExpressionAst";
    const rawNameUnstripped = isFirstStringLiteral && typeof first.value === "string" ? first.value : first.text;
    const rawName = rawNameUnstripped.replace(/^['"]|['"]$/g, "");
    if (/[\u0080-\uFFFF]/.test(rawName)) {
      nameType = "application";
    } else {
      nameType = classifyCommandName(rawName);
    }
    name = stripModulePrefix(rawName);
    elementTypes.push(mapElementType(first.type, first.expressionType));
    for (let i = 1; i < cmdElements.length; i++) {
      const ce = cmdElements[i];
      const isStringLiteral = ce.type === "StringConstantExpressionAst" || ce.type === "ExpandableStringExpressionAst";
      args.push(isStringLiteral && ce.value != null ? ce.value : ce.text);
      elementTypes.push(mapElementType(ce.type, ce.expressionType));
      const rawChildren = ensureArray(ce.children);
      if (rawChildren.length > 0) {
        hasChildren = true;
        children.push(
          rawChildren.map((c) => ({
            type: mapElementType(c.type),
            text: c.text
          }))
        );
      } else {
        children.push(void 0);
      }
    }
  }
  const result = {
    name,
    nameType,
    elementType: "CommandAst",
    args,
    text: raw.text,
    elementTypes,
    ...hasChildren ? { children } : {}
  };
  const rawRedirs = ensureArray(raw.redirections);
  if (rawRedirs.length > 0) {
    result.redirections = rawRedirs.map(transformRedirection);
  }
  return result;
}
function transformExpressionElement(raw) {
  const elementType = raw.type === "ParenExpressionAst" ? "ParenExpressionAst" : "CommandExpressionAst";
  const elementTypes = [
    mapElementType(raw.type, raw.expressionType)
  ];
  return {
    name: raw.text,
    nameType: "unknown",
    elementType,
    args: [],
    text: raw.text,
    elementTypes
  };
}
function transformRedirection(raw) {
  if (raw.type === "MergingRedirectionAst") {
    return { operator: "2>&1", target: "", isMerging: true };
  }
  const append = raw.append ?? false;
  const fromStream = raw.fromStream ?? "Output";
  let operator;
  if (append) {
    switch (fromStream) {
      case "Error":
        operator = "2>>";
        break;
      case "All":
        operator = "*>>";
        break;
      default:
        operator = ">>";
        break;
    }
  } else {
    switch (fromStream) {
      case "Error":
        operator = "2>";
        break;
      case "All":
        operator = "*>";
        break;
      default:
        operator = ">";
        break;
    }
  }
  return { operator, target: raw.locationText ?? "", isMerging: false };
}
function transformStatement(raw) {
  const statementType = mapStatementType(raw.type);
  const commands = [];
  const redirections = [];
  if (raw.elements) {
    for (const elem of ensureArray(raw.elements)) {
      if (elem.type === "CommandAst") {
        commands.push(transformCommandAst(elem));
        for (const redir of ensureArray(elem.redirections)) {
          redirections.push(transformRedirection(redir));
        }
      } else {
        commands.push(transformExpressionElement(elem));
        for (const redir of ensureArray(elem.redirections)) {
          redirections.push(transformRedirection(redir));
        }
      }
    }
    const seen = new Set(redirections.map((r) => `${r.operator}\0${r.target}`));
    for (const redir of ensureArray(raw.redirections)) {
      const r = transformRedirection(redir);
      const key = `${r.operator}\0${r.target}`;
      if (!seen.has(key)) {
        seen.add(key);
        redirections.push(r);
      }
    }
  } else {
    commands.push({
      name: raw.text,
      nameType: "unknown",
      elementType: "CommandExpressionAst",
      args: [],
      text: raw.text
    });
    for (const redir of ensureArray(raw.redirections)) {
      redirections.push(transformRedirection(redir));
    }
  }
  let nestedCommands;
  const rawNested = ensureArray(raw.nestedCommands);
  if (rawNested.length > 0) {
    nestedCommands = rawNested.map(transformCommandAst);
  }
  const result = {
    statementType,
    commands,
    redirections,
    text: raw.text,
    nestedCommands
  };
  if (raw.securityPatterns) {
    result.securityPatterns = raw.securityPatterns;
  }
  return result;
}
function transformRawOutput(raw) {
  const result = {
    valid: raw.valid,
    errors: ensureArray(raw.errors),
    statements: ensureArray(raw.statements).map(transformStatement),
    variables: ensureArray(raw.variables),
    hasStopParsing: raw.hasStopParsing,
    originalCommand: raw.originalCommand
  };
  const tl = ensureArray(raw.typeLiterals);
  if (tl.length > 0) {
    result.typeLiterals = tl;
  }
  if (raw.hasUsingStatements) {
    result.hasUsingStatements = true;
  }
  if (raw.hasScriptRequirements) {
    result.hasScriptRequirements = true;
  }
  return result;
}
async function parsePowerShellCommandImpl(command) {
  const commandBytes = Buffer.byteLength(command, "utf8");
  if (commandBytes > MAX_COMMAND_LENGTH) {
    logForDebugging(
      `PowerShell parser: command too long (${commandBytes} bytes, max ${MAX_COMMAND_LENGTH})`
    );
    return makeInvalidResult(
      command,
      `Command too long for parsing (${commandBytes} bytes). Maximum supported length is ${MAX_COMMAND_LENGTH} bytes.`,
      "CommandTooLong"
    );
  }
  const pwshPath = await getCachedPowerShellPath();
  if (!pwshPath) {
    return makeInvalidResult(
      command,
      "PowerShell is not available",
      "NoPowerShell"
    );
  }
  const script = buildParseScript(command);
  const encodedScript = toUtf16LeBase64(script);
  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-NoLogo",
    "-EncodedCommand",
    encodedScript
  ];
  const parseTimeoutMs = getParseTimeoutMs();
  let stdout = "";
  let stderr = "";
  let code = null;
  let timedOut = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await execa(pwshPath, args, {
        timeout: parseTimeoutMs,
        reject: false
      });
      stdout = result.stdout;
      stderr = result.stderr;
      timedOut = result.timedOut;
      code = result.failed ? result.exitCode ?? 1 : 0;
    } catch (e) {
      logForDebugging(
        `PowerShell parser: failed to spawn pwsh: ${e instanceof Error ? e.message : e}`
      );
      return makeInvalidResult(
        command,
        `Failed to spawn PowerShell: ${e instanceof Error ? e.message : e}`,
        "PwshSpawnError"
      );
    }
    if (!timedOut) break;
    logForDebugging(
      `PowerShell parser: pwsh timed out after ${parseTimeoutMs}ms (attempt ${attempt + 1})`
    );
  }
  if (timedOut) {
    return makeInvalidResult(
      command,
      `pwsh timed out after ${parseTimeoutMs}ms (2 attempts)`,
      "PwshTimeout"
    );
  }
  if (code !== 0) {
    logForDebugging(
      `PowerShell parser: pwsh exited with code ${code}, stderr: ${stderr}`
    );
    return makeInvalidResult(
      command,
      `pwsh exited with code ${code}: ${stderr}`,
      "PwshError"
    );
  }
  const trimmed = stdout.trim();
  if (!trimmed) {
    logForDebugging("PowerShell parser: empty stdout from pwsh");
    return makeInvalidResult(
      command,
      "No output from PowerShell parser",
      "EmptyOutput"
    );
  }
  try {
    const raw = jsonParse(trimmed);
    return transformRawOutput(raw);
  } catch {
    logForDebugging(
      `PowerShell parser: invalid JSON output: ${trimmed.slice(0, 200)}`
    );
    return makeInvalidResult(
      command,
      "Invalid JSON from PowerShell parser",
      "InvalidJson"
    );
  }
}
const TRANSIENT_ERROR_IDS = /* @__PURE__ */ new Set([
  "PwshSpawnError",
  "PwshError",
  "PwshTimeout",
  "EmptyOutput",
  "InvalidJson"
]);
const parsePowerShellCommandCached = memoizeWithLRU(
  (command) => {
    const promise = parsePowerShellCommandImpl(command);
    void promise.then((result) => {
      if (!result.valid && TRANSIENT_ERROR_IDS.has(result.errors[0]?.errorId ?? "")) {
        parsePowerShellCommandCached.cache.delete(command);
      }
    });
    return promise;
  },
  (command) => command,
  256
);
const COMMON_ALIASES = Object.assign(
  /* @__PURE__ */ Object.create(null),
  {
    // Directory listing
    ls: "Get-ChildItem",
    dir: "Get-ChildItem",
    gci: "Get-ChildItem",
    // Content
    cat: "Get-Content",
    type: "Get-Content",
    gc: "Get-Content",
    // Navigation
    cd: "Set-Location",
    sl: "Set-Location",
    chdir: "Set-Location",
    pushd: "Push-Location",
    popd: "Pop-Location",
    pwd: "Get-Location",
    gl: "Get-Location",
    // Items
    gi: "Get-Item",
    gp: "Get-ItemProperty",
    ni: "New-Item",
    mkdir: "New-Item",
    // `md` is PowerShell's built-in alias for `mkdir`. resolveToCanonical is
    // single-hop (no md→mkdir→New-Item chaining), so it needs its own entry
    // or `md /etc/x` falls through while `mkdir /etc/x` is caught.
    md: "New-Item",
    ri: "Remove-Item",
    del: "Remove-Item",
    rd: "Remove-Item",
    rmdir: "Remove-Item",
    rm: "Remove-Item",
    erase: "Remove-Item",
    mi: "Move-Item",
    mv: "Move-Item",
    move: "Move-Item",
    ci: "Copy-Item",
    cp: "Copy-Item",
    copy: "Copy-Item",
    cpi: "Copy-Item",
    si: "Set-Item",
    rni: "Rename-Item",
    ren: "Rename-Item",
    // Process
    ps: "Get-Process",
    gps: "Get-Process",
    kill: "Stop-Process",
    spps: "Stop-Process",
    start: "Start-Process",
    saps: "Start-Process",
    sajb: "Start-Job",
    ipmo: "Import-Module",
    // Output
    echo: "Write-Output",
    write: "Write-Output",
    sleep: "Start-Sleep",
    // Help
    help: "Get-Help",
    man: "Get-Help",
    gcm: "Get-Command",
    // Service
    gsv: "Get-Service",
    // Variables
    gv: "Get-Variable",
    sv: "Set-Variable",
    // History
    h: "Get-History",
    history: "Get-History",
    // Invoke
    iex: "Invoke-Expression",
    iwr: "Invoke-WebRequest",
    irm: "Invoke-RestMethod",
    icm: "Invoke-Command",
    ii: "Invoke-Item",
    // PSSession — remote code execution surface
    nsn: "New-PSSession",
    etsn: "Enter-PSSession",
    exsn: "Exit-PSSession",
    gsn: "Get-PSSession",
    rsn: "Remove-PSSession",
    // Misc
    cls: "Clear-Host",
    clear: "Clear-Host",
    select: "Select-Object",
    where: "Where-Object",
    foreach: "ForEach-Object",
    "%": "ForEach-Object",
    "?": "Where-Object",
    measure: "Measure-Object",
    ft: "Format-Table",
    fl: "Format-List",
    fw: "Format-Wide",
    oh: "Out-Host",
    ogv: "Out-GridView",
    // SECURITY: The following aliases are deliberately omitted because PS Core 6+
    // removed them (they collide with native executables). Our allowlist logic
    // resolves aliases BEFORE checking safety — if we map 'sort' → 'Sort-Object'
    // but PowerShell 7/Windows actually runs sort.exe, we'd auto-allow the wrong
    // program.
    //   'sc'   → sc.exe (Service Controller) — e.g. `sc config Svc binpath= ...`
    //   'sort' → sort.exe — e.g. `sort /O C:\evil.txt` (arbitrary file write)
    //   'curl' → curl.exe (shipped with Windows 10 1803+)
    //   'wget' → wget.exe (if installed)
    // Prefer to leave ambiguous aliases unmapped — users can write the full name.
    // If adding aliases that resolve to SAFE_OUTPUT_CMDLETS or
    // ACCEPT_EDITS_ALLOWED_CMDLETS, verify no native .exe collision on PS Core.
    ac: "Add-Content",
    clc: "Clear-Content",
    // Write/export: tee-object/export-csv are in
    // CMDLET_PATH_CONFIG so path-level Edit denies fire on the full cmdlet name,
    // but PowerShell's built-in aliases fell through to ask-then-approve because
    // resolveToCanonical couldn't resolve them). Neither tee-object nor
    // export-csv is in SAFE_OUTPUT_CMDLETS or ACCEPT_EDITS_ALLOWED_CMDLETS, so
    // the native-exe collision warning above doesn't apply — on Linux PS Core
    // where `tee` runs /usr/bin/tee, that binary also writes to its positional
    // file arg and we correctly extract+check it.
    tee: "Tee-Object",
    epcsv: "Export-Csv",
    sp: "Set-ItemProperty",
    rp: "Remove-ItemProperty",
    cli: "Clear-Item",
    epal: "Export-Alias",
    // Text search
    sls: "Select-String"
  }
);
const DIRECTORY_CHANGE_CMDLETS = /* @__PURE__ */ new Set([
  "set-location",
  "push-location",
  "pop-location"
]);
const DIRECTORY_CHANGE_ALIASES = /* @__PURE__ */ new Set(["cd", "sl", "chdir", "pushd", "popd"]);
function getAllCommandNames(parsed) {
  const names = [];
  for (const statement of parsed.statements) {
    for (const cmd of statement.commands) {
      names.push(cmd.name.toLowerCase());
    }
    if (statement.nestedCommands) {
      for (const cmd of statement.nestedCommands) {
        names.push(cmd.name.toLowerCase());
      }
    }
  }
  return names;
}
function getAllCommands(parsed) {
  const commands = [];
  for (const statement of parsed.statements) {
    for (const cmd of statement.commands) {
      commands.push(cmd);
    }
    if (statement.nestedCommands) {
      for (const cmd of statement.nestedCommands) {
        commands.push(cmd);
      }
    }
  }
  return commands;
}
function getAllRedirections(parsed) {
  const redirections = [];
  for (const statement of parsed.statements) {
    for (const redir of statement.redirections) {
      redirections.push(redir);
    }
    if (statement.nestedCommands) {
      for (const cmd of statement.nestedCommands) {
        if (cmd.redirections) {
          for (const redir of cmd.redirections) {
            redirections.push(redir);
          }
        }
      }
    }
  }
  return redirections;
}
function getVariablesByScope(parsed, scope) {
  const prefix = scope.toLowerCase() + ":";
  return parsed.variables.filter((v) => v.path.toLowerCase().startsWith(prefix));
}
function hasCommandNamed(parsed, name) {
  const lowerName = name.toLowerCase();
  const canonicalFromAlias = COMMON_ALIASES[lowerName]?.toLowerCase();
  for (const cmdName of getAllCommandNames(parsed)) {
    if (cmdName === lowerName) {
      return true;
    }
    const canonical = COMMON_ALIASES[cmdName]?.toLowerCase();
    if (canonical === lowerName) {
      return true;
    }
    if (canonicalFromAlias && cmdName === canonicalFromAlias) {
      return true;
    }
    if (canonical && canonicalFromAlias && canonical === canonicalFromAlias) {
      return true;
    }
  }
  return false;
}
function hasDirectoryChange(parsed) {
  for (const cmdName of getAllCommandNames(parsed)) {
    if (DIRECTORY_CHANGE_CMDLETS.has(cmdName) || DIRECTORY_CHANGE_ALIASES.has(cmdName)) {
      return true;
    }
  }
  return false;
}
function isSingleCommand(parsed) {
  const stmt = parsed.statements[0];
  return parsed.statements.length === 1 && stmt !== void 0 && stmt.commands.length === 1 && (!stmt.nestedCommands || stmt.nestedCommands.length === 0);
}
function commandHasArg(command, arg) {
  const lowerArg = arg.toLowerCase();
  return command.args.some((a) => a.toLowerCase() === lowerArg);
}
const PS_TOKENIZER_DASH_CHARS = /* @__PURE__ */ new Set([
  "-",
  // U+002D hyphen-minus (ASCII)
  "\u2013",
  // en-dash
  "\u2014",
  // em-dash
  "\u2015"
  // horizontal bar
]);
function isPowerShellParameter(arg, elementType) {
  if (elementType !== void 0) {
    return elementType === "Parameter";
  }
  return arg.length > 0 && PS_TOKENIZER_DASH_CHARS.has(arg[0]);
}
function commandHasArgAbbreviation(command, fullParam, minPrefix) {
  const lowerFull = fullParam.toLowerCase();
  const lowerMin = minPrefix.toLowerCase();
  return command.args.some((a) => {
    const colonIndex = a.indexOf(":", 1);
    const paramPart = colonIndex > 0 ? a.slice(0, colonIndex) : a;
    const lower = paramPart.replace(/`/g, "").toLowerCase();
    return lower.startsWith(lowerMin) && lowerFull.startsWith(lower) && lower.length <= lowerFull.length;
  });
}
function getPipelineSegments(parsed) {
  return parsed.statements;
}
function isNullRedirectionTarget(target) {
  const t = target.trim().toLowerCase();
  return t === "$null" || t === "${null}";
}
function getFileRedirections(parsed) {
  return getAllRedirections(parsed).filter(
    (r) => !r.isMerging && !isNullRedirectionTarget(r.target)
  );
}
function deriveSecurityFlags(parsed) {
  const flags = {
    hasSubExpressions: false,
    hasScriptBlocks: false,
    hasSplatting: false,
    hasExpandableStrings: false,
    hasMemberInvocations: false,
    hasAssignments: false,
    hasStopParsing: parsed.hasStopParsing
  };
  function checkElements(cmd) {
    if (!cmd.elementTypes) {
      return;
    }
    for (const et of cmd.elementTypes) {
      switch (et) {
        case "ScriptBlock":
          flags.hasScriptBlocks = true;
          break;
        case "SubExpression":
          flags.hasSubExpressions = true;
          break;
        case "ExpandableString":
          flags.hasExpandableStrings = true;
          break;
        case "MemberInvocation":
          flags.hasMemberInvocations = true;
          break;
      }
    }
  }
  for (const stmt of parsed.statements) {
    if (stmt.statementType === "AssignmentStatementAst") {
      flags.hasAssignments = true;
    }
    for (const cmd of stmt.commands) {
      checkElements(cmd);
    }
    if (stmt.nestedCommands) {
      for (const cmd of stmt.nestedCommands) {
        checkElements(cmd);
      }
    }
    if (stmt.securityPatterns) {
      if (stmt.securityPatterns.hasMemberInvocations) {
        flags.hasMemberInvocations = true;
      }
      if (stmt.securityPatterns.hasSubExpressions) {
        flags.hasSubExpressions = true;
      }
      if (stmt.securityPatterns.hasExpandableStrings) {
        flags.hasExpandableStrings = true;
      }
      if (stmt.securityPatterns.hasScriptBlocks) {
        flags.hasScriptBlocks = true;
      }
    }
  }
  for (const v of parsed.variables) {
    if (v.isSplatted) {
      flags.hasSplatting = true;
      break;
    }
  }
  return flags;
}
export {
  COMMON_ALIASES,
  MAX_COMMAND_LENGTH,
  PARSE_SCRIPT_BODY,
  PS_TOKENIZER_DASH_CHARS,
  WINDOWS_MAX_COMMAND_LENGTH,
  classifyCommandName,
  commandHasArg,
  commandHasArgAbbreviation,
  deriveSecurityFlags,
  getAllCommandNames,
  getAllCommands,
  getAllRedirections,
  getFileRedirections,
  getPipelineSegments,
  getVariablesByScope,
  hasCommandNamed,
  hasDirectoryChange,
  isNullRedirectionTarget,
  isPowerShellParameter,
  isSingleCommand,
  mapElementType,
  mapStatementType,
  parsePowerShellCommandCached as parsePowerShellCommand,
  stripModulePrefix,
  transformCommandAst,
  transformExpressionElement,
  transformRedirection,
  transformStatement
};
