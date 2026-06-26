import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFileCb);
async function getWorktreePathsPortable(cwd) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["worktree", "list", "--porcelain"],
      { cwd, timeout: 5e3 }
    );
    if (!stdout) return [];
    return stdout.split("\n").filter((line) => line.startsWith("worktree ")).map((line) => line.slice("worktree ".length).normalize("NFC"));
  } catch {
    return [];
  }
}
export {
  getWorktreePathsPortable
};
