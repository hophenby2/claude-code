import { z } from "zod/v4";
function semanticNumber(inner = z.number()) {
  return z.preprocess((v) => {
    if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return v;
  }, inner);
}
export {
  semanticNumber
};
