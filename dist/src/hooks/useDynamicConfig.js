import React from "react";
import { getDynamicConfig_BLOCKS_ON_INIT } from "../services/analytics/growthbook.js";
function useDynamicConfig(configName, defaultValue) {
  const [configValue, setConfigValue] = React.useState(defaultValue);
  React.useEffect(() => {
    if (process.env.NODE_ENV === "test") {
      return;
    }
    void getDynamicConfig_BLOCKS_ON_INIT(configName, defaultValue).then(
      setConfigValue
    );
  }, [configName, defaultValue]);
  return configValue;
}
export {
  useDynamicConfig
};
