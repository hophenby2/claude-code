import { useEffect } from "react";
import { logEvent } from "../services/analytics/index.js";
import { z } from "zod/v4";
import { getConnectedIdeClient } from "../utils/ide.js";
import { lazySchema } from "../utils/lazySchema.js";
const LogEventSchema = lazySchema(
  () => z.object({
    method: z.literal("log_event"),
    params: z.object({
      eventName: z.string(),
      eventData: z.object({}).passthrough()
    })
  })
);
function useIdeLogging(mcpClients) {
  useEffect(() => {
    if (!mcpClients.length) {
      return;
    }
    const ideClient = getConnectedIdeClient(mcpClients);
    if (ideClient) {
      ideClient.client.setNotificationHandler(
        LogEventSchema(),
        (notification) => {
          const { eventName, eventData } = notification.params;
          logEvent(
            `tengu_ide_${eventName}`,
            eventData
          );
        }
      );
    }
  }, [mcpClients]);
}
export {
  useIdeLogging
};
