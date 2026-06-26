import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { homedir } from "os";
import { relative } from "path";
import { Box, Text } from "../../ink.js";
import { getCwd } from "../../utils/cwd.js";
function getRelativeMemoryPath(path) {
  const homeDir = homedir();
  const cwd = getCwd();
  const relativeToHome = path.startsWith(homeDir) ? "~" + path.slice(homeDir.length) : null;
  const relativeToCwd = path.startsWith(cwd) ? "./" + relative(cwd, path) : null;
  if (relativeToHome && relativeToCwd) {
    return relativeToHome.length <= relativeToCwd.length ? relativeToHome : relativeToCwd;
  }
  return relativeToHome || relativeToCwd || path;
}
function MemoryUpdateNotification(t0) {
  const $ = _c(4);
  const {
    memoryPath
  } = t0;
  let t1;
  if ($[0] !== memoryPath) {
    t1 = getRelativeMemoryPath(memoryPath);
    $[0] = memoryPath;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const displayPath = t1;
  let t2;
  if ($[2] !== displayPath) {
    t2 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", flexGrow: 1, children: /* @__PURE__ */ jsxs(Text, { color: "text", children: [
      "Memory updated in ",
      displayPath,
      " \xB7 /memory to edit"
    ] }) });
    $[2] = displayPath;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}
export {
  MemoryUpdateNotification,
  getRelativeMemoryPath
};
