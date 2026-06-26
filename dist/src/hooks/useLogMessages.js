import { useEffect, useRef } from "react";
import { useAppState } from "../state/AppState.js";
import { isAgentSwarmsEnabled } from "../utils/agentSwarmsEnabled.js";
import {
  cleanMessagesForLogging,
  isChainParticipant,
  recordTranscript
} from "../utils/sessionStorage.js";
function useLogMessages(messages, ignore = false) {
  const teamContext = useAppState((s) => s.teamContext);
  const lastRecordedLengthRef = useRef(0);
  const lastParentUuidRef = useRef(void 0);
  const firstMessageUuidRef = useRef(void 0);
  const callSeqRef = useRef(0);
  useEffect(() => {
    if (ignore) return;
    const currentFirstUuid = messages[0]?.uuid;
    const prevLength = lastRecordedLengthRef.current;
    const wasFirstRender = firstMessageUuidRef.current === void 0;
    const isIncremental = currentFirstUuid !== void 0 && !wasFirstRender && currentFirstUuid === firstMessageUuidRef.current && prevLength <= messages.length;
    const isSameHeadShrink = currentFirstUuid !== void 0 && !wasFirstRender && currentFirstUuid === firstMessageUuidRef.current && prevLength > messages.length;
    const startIndex = isIncremental ? prevLength : 0;
    if (startIndex === messages.length) return;
    const slice = startIndex === 0 ? messages : messages.slice(startIndex);
    const parentHint = isIncremental ? lastParentUuidRef.current : void 0;
    const seq = ++callSeqRef.current;
    void recordTranscript(
      slice,
      isAgentSwarmsEnabled() ? {
        teamName: teamContext?.teamName,
        agentName: teamContext?.selfAgentName
      } : {},
      parentHint,
      messages
    ).then((lastRecordedUuid) => {
      if (seq !== callSeqRef.current) return;
      if (lastRecordedUuid && !isIncremental) {
        lastParentUuidRef.current = lastRecordedUuid;
      }
    });
    if (isIncremental || wasFirstRender || isSameHeadShrink) {
      const last = cleanMessagesForLogging(slice, messages).findLast(
        isChainParticipant
      );
      if (last) lastParentUuidRef.current = last.uuid;
    }
    lastRecordedLengthRef.current = messages.length;
    firstMessageUuidRef.current = currentFirstUuid;
  }, [messages, ignore, teamContext?.teamName, teamContext?.selfAgentName]);
}
export {
  useLogMessages
};
