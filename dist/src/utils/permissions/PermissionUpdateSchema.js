import z from "zod/v4";
import { lazySchema } from "../lazySchema.js";
import { externalPermissionModeSchema } from "./PermissionMode.js";
import {
  permissionBehaviorSchema,
  permissionRuleValueSchema
} from "./PermissionRule.js";
const permissionUpdateDestinationSchema = lazySchema(
  () => z.enum([
    // User settings (global)
    "userSettings",
    // Project settings (shared per-directory)
    "projectSettings",
    // Local settings (gitignored)
    "localSettings",
    // In-memory for the current session only
    "session",
    // From the command line arguments
    "cliArg"
  ])
);
const permissionUpdateSchema = lazySchema(
  () => z.discriminatedUnion("type", [
    z.object({
      type: z.literal("addRules"),
      rules: z.array(permissionRuleValueSchema()),
      behavior: permissionBehaviorSchema(),
      destination: permissionUpdateDestinationSchema()
    }),
    z.object({
      type: z.literal("replaceRules"),
      rules: z.array(permissionRuleValueSchema()),
      behavior: permissionBehaviorSchema(),
      destination: permissionUpdateDestinationSchema()
    }),
    z.object({
      type: z.literal("removeRules"),
      rules: z.array(permissionRuleValueSchema()),
      behavior: permissionBehaviorSchema(),
      destination: permissionUpdateDestinationSchema()
    }),
    z.object({
      type: z.literal("setMode"),
      mode: externalPermissionModeSchema(),
      destination: permissionUpdateDestinationSchema()
    }),
    z.object({
      type: z.literal("addDirectories"),
      directories: z.array(z.string()),
      destination: permissionUpdateDestinationSchema()
    }),
    z.object({
      type: z.literal("removeDirectories"),
      directories: z.array(z.string()),
      destination: permissionUpdateDestinationSchema()
    })
  ])
);
export {
  permissionUpdateDestinationSchema,
  permissionUpdateSchema
};
