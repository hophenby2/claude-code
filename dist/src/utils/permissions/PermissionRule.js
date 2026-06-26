import z from "zod/v4";
import { lazySchema } from "../lazySchema.js";
const permissionBehaviorSchema = lazySchema(
  () => z.enum(["allow", "deny", "ask"])
);
const permissionRuleValueSchema = lazySchema(
  () => z.object({
    toolName: z.string(),
    ruleContent: z.string().optional()
  })
);
export {
  permissionBehaviorSchema,
  permissionRuleValueSchema
};
