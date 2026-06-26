import { z } from "zod/v4";
import { lazySchema } from "../../utils/lazySchema.js";
import { parsePluginIdentifier } from "../../utils/plugins/pluginIdentifier.js";
import { getFeatureValue_CACHED_MAY_BE_STALE } from "../analytics/growthbook.js";
const ChannelAllowlistSchema = lazySchema(
  () => z.array(
    z.object({
      marketplace: z.string(),
      plugin: z.string()
    })
  )
);
function getChannelAllowlist() {
  const raw = getFeatureValue_CACHED_MAY_BE_STALE(
    "tengu_harbor_ledger",
    []
  );
  const parsed = ChannelAllowlistSchema().safeParse(raw);
  return parsed.success ? parsed.data : [];
}
function isChannelsEnabled() {
  return getFeatureValue_CACHED_MAY_BE_STALE("tengu_harbor", false);
}
function isChannelAllowlisted(pluginSource) {
  if (!pluginSource) return false;
  const { name, marketplace } = parsePluginIdentifier(pluginSource);
  if (!marketplace) return false;
  return getChannelAllowlist().some(
    (e) => e.plugin === name && e.marketplace === marketplace
  );
}
export {
  getChannelAllowlist,
  isChannelAllowlisted,
  isChannelsEnabled
};
