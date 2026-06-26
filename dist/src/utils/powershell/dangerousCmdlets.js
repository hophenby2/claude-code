import { CROSS_PLATFORM_CODE_EXEC } from "../permissions/dangerousPatterns.js";
import { COMMON_ALIASES } from "./parser.js";
const FILEPATH_EXECUTION_CMDLETS = /* @__PURE__ */ new Set([
  "invoke-command",
  "start-job",
  "start-threadjob",
  "register-scheduledjob"
]);
const DANGEROUS_SCRIPT_BLOCK_CMDLETS = /* @__PURE__ */ new Set([
  "invoke-command",
  "invoke-expression",
  "start-job",
  "start-threadjob",
  "register-scheduledjob",
  "register-engineevent",
  "register-objectevent",
  "register-wmievent",
  "new-pssession",
  "enter-pssession"
]);
const MODULE_LOADING_CMDLETS = /* @__PURE__ */ new Set([
  "import-module",
  "ipmo",
  "install-module",
  "save-module",
  "update-module",
  "install-script",
  "save-script"
]);
const SHELLS_AND_SPAWNERS = [
  "pwsh",
  "powershell",
  "cmd",
  "bash",
  "wsl",
  "sh",
  "start-process",
  "start",
  "add-type",
  "new-object"
];
function aliasesOf(targets) {
  return Object.entries(COMMON_ALIASES).filter(([, target]) => targets.has(target.toLowerCase())).map(([alias]) => alias);
}
const NETWORK_CMDLETS = /* @__PURE__ */ new Set([
  "invoke-webrequest",
  "invoke-restmethod"
]);
const ALIAS_HIJACK_CMDLETS = /* @__PURE__ */ new Set([
  "set-alias",
  "sal",
  // alias not in COMMON_ALIASES — list explicitly
  "new-alias",
  "nal",
  // alias not in COMMON_ALIASES — list explicitly
  "set-variable",
  "sv",
  // alias not in COMMON_ALIASES — list explicitly
  "new-variable",
  "nv"
  // alias not in COMMON_ALIASES — list explicitly
]);
const WMI_CIM_CMDLETS = /* @__PURE__ */ new Set([
  "invoke-wmimethod",
  "iwmi",
  // alias not in COMMON_ALIASES — list explicitly
  "invoke-cimmethod"
]);
const ARG_GATED_CMDLETS = /* @__PURE__ */ new Set([
  "select-object",
  "sort-object",
  "group-object",
  "where-object",
  "measure-object",
  "write-output",
  "write-host",
  "start-sleep",
  "format-table",
  "format-list",
  "format-wide",
  "format-custom",
  "out-string",
  "out-host",
  // Native executables with callback-gated args (e.g. ipconfig /flushdns
  // is rejected, ipconfig /all is allowed). Same bypass risk.
  "ipconfig",
  "hostname",
  "route"
]);
const NEVER_SUGGEST = (() => {
  const core = /* @__PURE__ */ new Set([
    ...SHELLS_AND_SPAWNERS,
    ...FILEPATH_EXECUTION_CMDLETS,
    ...DANGEROUS_SCRIPT_BLOCK_CMDLETS,
    ...MODULE_LOADING_CMDLETS,
    ...NETWORK_CMDLETS,
    ...ALIAS_HIJACK_CMDLETS,
    ...WMI_CIM_CMDLETS,
    ...ARG_GATED_CMDLETS,
    // ForEach-Object's -MemberName (positional: `% Delete`) resolves against
    // the runtime pipeline object — `Get-ChildItem | % Delete` invokes
    // FileInfo.Delete(). StaticParameterBinder identifies the
    // PropertyAndMethodSet parameter set, but the set handles both; the arg
    // is a plain StringConstantExpressionAst with no property/method signal.
    // Pipeline type inference (upstream OutputType → GetMember) misses ETS
    // AliasProperty members and has no answer for `$var | %` or external
    // upstream. Not in ARG_GATED (no allowlist entry to sync with).
    "foreach-object",
    // Interpreters/runners — `node script.js` stops at the file arg and
    // suggests bare `node:*`, auto-allowing arbitrary code via -e/-p. The
    // auto-mode classifier strips these rules (isDangerousPowerShellPermission)
    // but the suggestion gate didn't. Multi-word entries ('npm run') are
    // filtered out — NEVER_SUGGEST is a single-name lookup on cmd.name.
    ...CROSS_PLATFORM_CODE_EXEC.filter((p) => !p.includes(" "))
  ]);
  return /* @__PURE__ */ new Set([...core, ...aliasesOf(core)]);
})();
export {
  ALIAS_HIJACK_CMDLETS,
  ARG_GATED_CMDLETS,
  DANGEROUS_SCRIPT_BLOCK_CMDLETS,
  FILEPATH_EXECUTION_CMDLETS,
  MODULE_LOADING_CMDLETS,
  NETWORK_CMDLETS,
  NEVER_SUGGEST,
  WMI_CIM_CMDLETS
};
