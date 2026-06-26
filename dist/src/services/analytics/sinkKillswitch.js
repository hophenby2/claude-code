import { getDynamicConfig_CACHED_MAY_BE_STALE } from "./growthbook.js";
const SINK_KILLSWITCH_CONFIG_NAME = "tengu_frond_boric";
function isSinkKilled(sink) {
  const config = getDynamicConfig_CACHED_MAY_BE_STALE(SINK_KILLSWITCH_CONFIG_NAME, {});
  return config?.[sink] === true;
}
export {
  isSinkKilled
};
