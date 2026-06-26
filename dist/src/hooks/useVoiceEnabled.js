import { useMemo } from "react";
import { useAppState } from "../state/AppState.js";
import {
  hasVoiceAuth,
  isVoiceGrowthBookEnabled
} from "../voice/voiceModeEnabled.js";
function useVoiceEnabled() {
  const userIntent = useAppState((s) => s.settings.voiceEnabled === true);
  const authVersion = useAppState((s) => s.authVersion);
  const authed = useMemo(hasVoiceAuth, [authVersion]);
  return userIntent && authed && isVoiceGrowthBookEnabled();
}
export {
  useVoiceEnabled
};
