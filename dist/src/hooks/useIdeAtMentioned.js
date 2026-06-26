import { useEffect, useRef } from "react";
import { logError } from "../utils/log.js";
import { z } from "zod/v4";
import { getConnectedIdeClient } from "../utils/ide.js";
import { lazySchema } from "../utils/lazySchema.js";
const NOTIFICATION_METHOD = "at_mentioned";
const AtMentionedSchema = lazySchema(
  () => z.object({
    method: z.literal(NOTIFICATION_METHOD),
    params: z.object({
      filePath: z.string(),
      lineStart: z.number().optional(),
      lineEnd: z.number().optional()
    })
  })
);
function useIdeAtMentioned(mcpClients, onAtMentioned) {
  const ideClientRef = useRef(void 0);
  useEffect(() => {
    const ideClient = getConnectedIdeClient(mcpClients);
    if (ideClientRef.current !== ideClient) {
      ideClientRef.current = ideClient;
    }
    if (ideClient) {
      ideClient.client.setNotificationHandler(
        AtMentionedSchema(),
        (notification) => {
          if (ideClientRef.current !== ideClient) {
            return;
          }
          try {
            const data = notification.params;
            const lineStart = data.lineStart !== void 0 ? data.lineStart + 1 : void 0;
            const lineEnd = data.lineEnd !== void 0 ? data.lineEnd + 1 : void 0;
            onAtMentioned({
              filePath: data.filePath,
              lineStart,
              lineEnd
            });
          } catch (error) {
            logError(error);
          }
        }
      );
    }
  }, [mcpClients, onAtMentioned]);
}
export {
  useIdeAtMentioned
};
