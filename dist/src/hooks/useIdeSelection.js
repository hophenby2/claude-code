import { useEffect, useRef } from "react";
import { logError } from "../utils/log.js";
import { z } from "zod/v4";
import { getConnectedIdeClient } from "../utils/ide.js";
import { lazySchema } from "../utils/lazySchema.js";
const SelectionChangedSchema = lazySchema(
  () => z.object({
    method: z.literal("selection_changed"),
    params: z.object({
      selection: z.object({
        start: z.object({
          line: z.number(),
          character: z.number()
        }),
        end: z.object({
          line: z.number(),
          character: z.number()
        })
      }).nullable().optional(),
      text: z.string().optional(),
      filePath: z.string().optional()
    })
  })
);
function useIdeSelection(mcpClients, onSelect) {
  const handlersRegistered = useRef(false);
  const currentIDERef = useRef(null);
  useEffect(() => {
    const ideClient = getConnectedIdeClient(mcpClients);
    if (currentIDERef.current !== (ideClient ?? null)) {
      handlersRegistered.current = false;
      currentIDERef.current = ideClient || null;
      onSelect({
        lineCount: 0,
        lineStart: void 0,
        text: void 0,
        filePath: void 0
      });
    }
    if (handlersRegistered.current || !ideClient) {
      return;
    }
    const selectionChangeHandler = (data) => {
      if (data.selection?.start && data.selection?.end) {
        const { start, end } = data.selection;
        let lineCount = end.line - start.line + 1;
        if (end.character === 0) {
          lineCount--;
        }
        const selection = {
          lineCount,
          lineStart: start.line,
          text: data.text,
          filePath: data.filePath
        };
        onSelect(selection);
      }
    };
    ideClient.client.setNotificationHandler(
      SelectionChangedSchema(),
      (notification) => {
        if (currentIDERef.current !== ideClient) {
          return;
        }
        try {
          const selectionData = notification.params;
          if (selectionData.selection && selectionData.selection.start && selectionData.selection.end) {
            selectionChangeHandler(selectionData);
          } else if (selectionData.text !== void 0) {
            selectionChangeHandler({
              selection: null,
              text: selectionData.text,
              filePath: selectionData.filePath
            });
          }
        } catch (error) {
          logError(error);
        }
      }
    );
    handlersRegistered.current = true;
  }, [mcpClients, onSelect]);
}
export {
  useIdeSelection
};
