import { useEffect } from "react";
import { isEnvTruthy } from "../utils/envUtils.js";
function useAfterFirstRender() {
  useEffect(() => {
    if (process.env.USER_TYPE === "ant" && isEnvTruthy(process.env.CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER)) {
      process.stderr.write(
        `
Startup time: ${Math.round(process.uptime() * 1e3)}ms
`
      );
      process.exit(0);
    }
  }, []);
}
export {
  useAfterFirstRender
};
