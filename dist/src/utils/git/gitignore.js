import { appendFile, mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname, join } from "path";
import { getCwd } from "../cwd.js";
import { getErrnoCode } from "../errors.js";
import { execFileNoThrowWithCwd } from "../execFileNoThrow.js";
import { dirIsInGitRepo } from "../git.js";
import { logError } from "../log.js";
async function isPathGitignored(filePath, cwd) {
  const { code } = await execFileNoThrowWithCwd(
    "git",
    ["check-ignore", filePath],
    {
      preserveOutputOnError: false,
      cwd
    }
  );
  return code === 0;
}
function getGlobalGitignorePath() {
  return join(homedir(), ".config", "git", "ignore");
}
async function addFileGlobRuleToGitignore(filename, cwd = getCwd()) {
  try {
    if (!await dirIsInGitRepo(cwd)) {
      return;
    }
    const gitignoreEntry = `**/${filename}`;
    const testPath = filename.endsWith("/") ? `${filename}sample-file.txt` : filename;
    if (await isPathGitignored(testPath, cwd)) {
      return;
    }
    const globalGitignorePath = getGlobalGitignorePath();
    const configGitDir = dirname(globalGitignorePath);
    await mkdir(configGitDir, { recursive: true });
    try {
      const content = await readFile(globalGitignorePath, { encoding: "utf-8" });
      if (content.includes(gitignoreEntry)) {
        return;
      }
      await appendFile(globalGitignorePath, `
${gitignoreEntry}
`);
    } catch (e) {
      const code = getErrnoCode(e);
      if (code === "ENOENT") {
        await writeFile(globalGitignorePath, `${gitignoreEntry}
`, "utf-8");
      } else {
        throw e;
      }
    }
  } catch (error) {
    logError(error);
  }
}
export {
  addFileGlobRuleToGitignore,
  getGlobalGitignorePath,
  isPathGitignored
};
