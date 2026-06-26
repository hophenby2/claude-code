import { execa } from "execa";
import { which } from "../which.js";
async function getGhAuthStatus() {
  const ghPath = await which("gh");
  if (!ghPath) {
    return "not_installed";
  }
  const { exitCode } = await execa("gh", ["auth", "token"], {
    stdout: "ignore",
    stderr: "ignore",
    timeout: 5e3,
    reject: false
  });
  return exitCode === 0 ? "authenticated" : "not_authenticated";
}
export {
  getGhAuthStatus
};
