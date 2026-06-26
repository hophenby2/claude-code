import { z } from "zod/v4";
import { lazySchema } from "../../utils/lazySchema.js";
const RemoteManagedSettingsResponseSchema = lazySchema(
  () => z.object({
    uuid: z.string(),
    // Settings UUID
    checksum: z.string(),
    settings: z.record(z.string(), z.unknown())
  })
);
export {
  RemoteManagedSettingsResponseSchema
};
