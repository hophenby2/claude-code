import { z } from "zod/v4";
function semanticBoolean(inner = z.boolean()) {
  return z.preprocess(
    (v) => v === "true" ? true : v === "false" ? false : v,
    inner
  );
}
export {
  semanticBoolean
};
