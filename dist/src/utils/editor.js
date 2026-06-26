import {
  spawn,
  spawnSync
} from "child_process";
import memoize from "lodash-es/memoize.js";
import { basename } from "path";
import instances from "../ink/instances.js";
import { logForDebugging } from "./debug.js";
import { whichSync } from "./which.js";
function isCommandAvailable(command) {
  return !!whichSync(command);
}
const GUI_EDITORS = [
  "code",
  "cursor",
  "windsurf",
  "codium",
  "subl",
  "atom",
  "gedit",
  "notepad++",
  "notepad"
];
const PLUS_N_EDITORS = /\b(vi|vim|nvim|nano|emacs|pico|micro|helix|hx)\b/;
const VSCODE_FAMILY = /* @__PURE__ */ new Set(["code", "cursor", "windsurf", "codium"]);
function classifyGuiEditor(editor) {
  const base = basename(editor.split(" ")[0] ?? "");
  return GUI_EDITORS.find((g) => base.includes(g));
}
function guiGotoArgv(guiFamily, filePath, line) {
  if (!line) return [filePath];
  if (VSCODE_FAMILY.has(guiFamily)) return ["-g", `${filePath}:${line}`];
  if (guiFamily === "subl") return [`${filePath}:${line}`];
  return [filePath];
}
function openFileInExternalEditor(filePath, line) {
  const editor = getExternalEditor();
  if (!editor) return false;
  const parts = editor.split(" ");
  const base = parts[0] ?? editor;
  const editorArgs = parts.slice(1);
  const guiFamily = classifyGuiEditor(editor);
  if (guiFamily) {
    const gotoArgv = guiGotoArgv(guiFamily, filePath, line);
    const detachedOpts = { detached: true, stdio: "ignore" };
    let child;
    if (process.platform === "win32") {
      const gotoStr = gotoArgv.map((a) => `"${a}"`).join(" ");
      child = spawn(`${editor} ${gotoStr}`, { ...detachedOpts, shell: true });
    } else {
      child = spawn(base, [...editorArgs, ...gotoArgv], detachedOpts);
    }
    child.on(
      "error",
      (e) => logForDebugging(`editor spawn failed: ${e}`, { level: "error" })
    );
    child.unref();
    return true;
  }
  const inkInstance = instances.get(process.stdout);
  if (!inkInstance) return false;
  const useGotoLine = line && PLUS_N_EDITORS.test(basename(base));
  inkInstance.enterAlternateScreen();
  try {
    const syncOpts = { stdio: "inherit" };
    let result;
    if (process.platform === "win32") {
      const lineArg = useGotoLine ? `+${line} ` : "";
      result = spawnSync(`${editor} ${lineArg}"${filePath}"`, {
        ...syncOpts,
        shell: true
      });
    } else {
      const args = [
        ...editorArgs,
        ...useGotoLine ? [`+${line}`, filePath] : [filePath]
      ];
      result = spawnSync(base, args, syncOpts);
    }
    if (result.error) {
      logForDebugging(`editor spawn failed: ${result.error}`, {
        level: "error"
      });
      return false;
    }
    return true;
  } finally {
    inkInstance.exitAlternateScreen();
  }
}
const getExternalEditor = memoize(() => {
  if (process.env.VISUAL?.trim()) {
    return process.env.VISUAL.trim();
  }
  if (process.env.EDITOR?.trim()) {
    return process.env.EDITOR.trim();
  }
  if (process.platform === "win32") {
    return "start /wait notepad";
  }
  const editors = ["code", "vi", "nano"];
  return editors.find((command) => isCommandAvailable(command));
});
export {
  classifyGuiEditor,
  getExternalEditor,
  openFileInExternalEditor
};
