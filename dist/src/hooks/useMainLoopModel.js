import { useEffect, useReducer } from "react";
import { onGrowthBookRefresh } from "../services/analytics/growthbook.js";
import { useAppState } from "../state/AppState.js";
import {
  getDefaultMainLoopModelSetting,
  parseUserSpecifiedModel
} from "../utils/model/model.js";
function useMainLoopModel() {
  const mainLoopModel = useAppState((s) => s.mainLoopModel);
  const mainLoopModelForSession = useAppState((s) => s.mainLoopModelForSession);
  const [, forceRerender] = useReducer((x) => x + 1, 0);
  useEffect(() => onGrowthBookRefresh(forceRerender), []);
  const model = parseUserSpecifiedModel(
    mainLoopModelForSession ?? mainLoopModel ?? getDefaultMainLoopModelSetting()
  );
  return model;
}
export {
  useMainLoopModel
};
