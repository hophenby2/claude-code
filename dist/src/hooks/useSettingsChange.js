import { useCallback, useEffect } from "react";
import { settingsChangeDetector } from "../utils/settings/changeDetector.js";
import { getSettings_DEPRECATED } from "../utils/settings/settings.js";
function useSettingsChange(onChange) {
  const handleChange = useCallback(
    (source) => {
      const newSettings = getSettings_DEPRECATED();
      onChange(source, newSettings);
    },
    [onChange]
  );
  useEffect(
    () => settingsChangeDetector.subscribe(handleChange),
    [handleChange]
  );
}
export {
  useSettingsChange
};
