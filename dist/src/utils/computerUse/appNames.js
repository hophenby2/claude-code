const PATH_ALLOWLIST = [
  "/Applications/",
  "/System/Applications/"
];
const NAME_PATTERN_BLOCKLIST = [
  /Helper(?:$|\s\()/,
  /Agent(?:$|\s\()/,
  /Service(?:$|\s\()/,
  /Uninstaller(?:$|\s\()/,
  /Updater(?:$|\s\()/,
  /^\./
];
const ALWAYS_KEEP_BUNDLE_IDS = /* @__PURE__ */ new Set([
  // Browsers
  "com.apple.Safari",
  "com.google.Chrome",
  "com.microsoft.edgemac",
  "org.mozilla.firefox",
  "company.thebrowser.Browser",
  // Arc
  // Communication
  "com.tinyspeck.slackmacgap",
  "us.zoom.xos",
  "com.microsoft.teams2",
  "com.microsoft.teams",
  "com.apple.MobileSMS",
  "com.apple.mail",
  // Productivity
  "com.microsoft.Word",
  "com.microsoft.Excel",
  "com.microsoft.Powerpoint",
  "com.microsoft.Outlook",
  "com.apple.iWork.Pages",
  "com.apple.iWork.Numbers",
  "com.apple.iWork.Keynote",
  "com.google.GoogleDocs",
  // Notes / PM
  "notion.id",
  "com.apple.Notes",
  "md.obsidian",
  "com.linear",
  "com.figma.Desktop",
  // Dev
  "com.microsoft.VSCode",
  "com.apple.Terminal",
  "com.googlecode.iterm2",
  "com.github.GitHubDesktop",
  // System essentials the model genuinely targets
  "com.apple.finder",
  "com.apple.iCal",
  "com.apple.systempreferences"
]);
const APP_NAME_ALLOWED = /^[\p{L}\p{M}\p{N}_ .&'()+-]+$/u;
const APP_NAME_MAX_LEN = 40;
const APP_NAME_MAX_COUNT = 50;
function isUserFacingPath(path, homeDir) {
  if (PATH_ALLOWLIST.some((root) => path.startsWith(root))) return true;
  if (homeDir) {
    const userApps = homeDir.endsWith("/") ? `${homeDir}Applications/` : `${homeDir}/Applications/`;
    if (path.startsWith(userApps)) return true;
  }
  return false;
}
function isNoisyName(name) {
  return NAME_PATTERN_BLOCKLIST.some((re) => re.test(name));
}
function sanitizeCore(raw, applyCharFilter) {
  const seen = /* @__PURE__ */ new Set();
  return raw.map((name) => name.trim()).filter((trimmed) => {
    if (!trimmed) return false;
    if (trimmed.length > APP_NAME_MAX_LEN) return false;
    if (applyCharFilter && !APP_NAME_ALLOWED.test(trimmed)) return false;
    if (seen.has(trimmed)) return false;
    seen.add(trimmed);
    return true;
  }).sort((a, b) => a.localeCompare(b));
}
function sanitizeAppNames(raw) {
  const filtered = sanitizeCore(raw, true);
  if (filtered.length <= APP_NAME_MAX_COUNT) return filtered;
  return [
    ...filtered.slice(0, APP_NAME_MAX_COUNT),
    `\u2026 and ${filtered.length - APP_NAME_MAX_COUNT} more`
  ];
}
function sanitizeTrustedNames(raw) {
  return sanitizeCore(raw, false);
}
function filterAppsForDescription(installed, homeDir) {
  const { alwaysKept, rest } = installed.reduce(
    (acc, app) => {
      if (ALWAYS_KEEP_BUNDLE_IDS.has(app.bundleId)) {
        acc.alwaysKept.push(app.displayName);
      } else if (isUserFacingPath(app.path, homeDir) && !isNoisyName(app.displayName)) {
        acc.rest.push(app.displayName);
      }
      return acc;
    },
    { alwaysKept: [], rest: [] }
  );
  const sanitizedAlways = sanitizeTrustedNames(alwaysKept);
  const alwaysSet = new Set(sanitizedAlways);
  return [
    ...sanitizedAlways,
    ...sanitizeAppNames(rest).filter((n) => !alwaysSet.has(n))
  ];
}
export {
  filterAppsForDescription
};
