import { z } from "zod/v4";
import { lazySchema } from "../../utils/lazySchema.js";
const PolicyLimitsResponseSchema = lazySchema(
  () => z.object({
    restrictions: z.record(z.string(), z.object({ allowed: z.boolean() }))
  })
);
export {
  PolicyLimitsResponseSchema
};
