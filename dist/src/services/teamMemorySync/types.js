import { z } from "zod/v4";
import { lazySchema } from "../../utils/lazySchema.js";
const TeamMemoryContentSchema = lazySchema(
  () => z.object({
    entries: z.record(z.string(), z.string()),
    // Per-key SHA-256 of entry content (`sha256:<hex>`). Added in
    // anthropic/anthropic#283027. Optional for forward-compat with older
    // server deployments; empty map when entries is empty.
    entryChecksums: z.record(z.string(), z.string()).optional()
  })
);
const TeamMemoryDataSchema = lazySchema(
  () => z.object({
    organizationId: z.string(),
    repo: z.string(),
    version: z.number(),
    lastModified: z.string(),
    // ISO 8601 timestamp
    checksum: z.string(),
    // SHA256 with 'sha256:' prefix
    content: TeamMemoryContentSchema()
  })
);
const TeamMemoryTooManyEntriesSchema = lazySchema(
  () => z.object({
    error: z.object({
      details: z.object({
        error_code: z.literal("team_memory_too_many_entries"),
        max_entries: z.number().int().positive(),
        received_entries: z.number().int().positive()
      })
    })
  })
);
export {
  TeamMemoryContentSchema,
  TeamMemoryDataSchema,
  TeamMemoryTooManyEntriesSchema
};
