import { useCallback, useEffect } from "react";
import {
  clearCommandMemoizationCaches,
  clearCommandsCache,
  getCommands
} from "../commands.js";
import { onGrowthBookRefresh } from "../services/analytics/growthbook.js";
import { logError } from "../utils/log.js";
import { skillChangeDetector } from "../utils/skills/skillChangeDetector.js";
function useSkillsChange(cwd, onCommandsChange) {
  const handleChange = useCallback(async () => {
    if (!cwd) return;
    try {
      clearCommandsCache();
      const commands = await getCommands(cwd);
      onCommandsChange(commands);
    } catch (error) {
      if (error instanceof Error) {
        logError(error);
      }
    }
  }, [cwd, onCommandsChange]);
  useEffect(() => skillChangeDetector.subscribe(handleChange), [handleChange]);
  const handleGrowthBookRefresh = useCallback(async () => {
    if (!cwd) return;
    try {
      clearCommandMemoizationCaches();
      const commands = await getCommands(cwd);
      onCommandsChange(commands);
    } catch (error) {
      if (error instanceof Error) {
        logError(error);
      }
    }
  }, [cwd, onCommandsChange]);
  useEffect(
    () => onGrowthBookRefresh(handleGrowthBookRefresh),
    [handleGrowthBookRefresh]
  );
}
export {
  useSkillsChange
};
