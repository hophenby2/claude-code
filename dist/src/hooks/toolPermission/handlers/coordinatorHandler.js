const feature = (_name) => false;
import { logError } from "../../../utils/log.js";
async function handleCoordinatorPermission(params) {
  const { ctx, updatedInput, suggestions, permissionMode } = params;
  try {
    const hookResult = await ctx.runHooks(
      permissionMode,
      suggestions,
      updatedInput
    );
    if (hookResult) return hookResult;
    const classifierResult = false ? await ctx.tryClassifier?.(params.pendingClassifierCheck, updatedInput) : null;
    if (classifierResult) {
      return classifierResult;
    }
  } catch (error) {
    if (error instanceof Error) {
      logError(error);
    } else {
      logError(new Error(`Automated permission check failed: ${String(error)}`));
    }
  }
  return null;
}
export {
  handleCoordinatorPermission
};
