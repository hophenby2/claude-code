import { basename } from "path";
import React from "react";
import { logError } from "../utils/log.js";
import { useDebounceCallback } from "usehooks-ts";
import {
  getImageFromClipboard,
  isImageFilePath,
  PASTE_THRESHOLD,
  tryReadImageFromPath
} from "../utils/imagePaste.js";
import { getPlatform } from "../utils/platform.js";
const CLIPBOARD_CHECK_DEBOUNCE_MS = 50;
const PASTE_COMPLETION_TIMEOUT_MS = 100;
function usePasteHandler({
  onPaste,
  onInput,
  onImagePaste
}) {
  const [pasteState, setPasteState] = React.useState({ chunks: [], timeoutId: null });
  const [isPasting, setIsPasting] = React.useState(false);
  const isMountedRef = React.useRef(true);
  const pastePendingRef = React.useRef(false);
  const isMacOS = React.useMemo(() => getPlatform() === "macos", []);
  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const checkClipboardForImageImpl = React.useCallback(() => {
    if (!onImagePaste || !isMountedRef.current) return;
    void getImageFromClipboard().then((imageData) => {
      if (imageData && isMountedRef.current) {
        onImagePaste(
          imageData.base64,
          imageData.mediaType,
          void 0,
          // no filename for clipboard images
          imageData.dimensions
        );
      }
    }).catch((error) => {
      if (isMountedRef.current) {
        logError(error);
      }
    }).finally(() => {
      if (isMountedRef.current) {
        setIsPasting(false);
      }
    });
  }, [onImagePaste]);
  const checkClipboardForImage = useDebounceCallback(
    checkClipboardForImageImpl,
    CLIPBOARD_CHECK_DEBOUNCE_MS
  );
  const resetPasteTimeout = React.useCallback(
    (currentTimeoutId) => {
      if (currentTimeoutId) {
        clearTimeout(currentTimeoutId);
      }
      return setTimeout(
        (setPasteState2, onImagePaste2, onPaste2, setIsPasting2, checkClipboardForImage2, isMacOS2, pastePendingRef2) => {
          pastePendingRef2.current = false;
          setPasteState2(({ chunks }) => {
            const pastedText = chunks.join("").replace(/\[I$/, "").replace(/\[O$/, "");
            const lines = pastedText.split(/ (?=\/|[A-Za-z]:\\)/).flatMap((part) => part.split("\n")).filter((line) => line.trim());
            const imagePaths = lines.filter((line) => isImageFilePath(line));
            if (onImagePaste2 && imagePaths.length > 0) {
              const isTempScreenshot = /\/TemporaryItems\/.*screencaptureui.*\/Screenshot/i.test(
                pastedText
              );
              void Promise.all(
                imagePaths.map((imagePath) => tryReadImageFromPath(imagePath))
              ).then((results) => {
                const validImages = results.filter(
                  (r) => r !== null
                );
                if (validImages.length > 0) {
                  for (const imageData of validImages) {
                    const filename = basename(imageData.path);
                    onImagePaste2(
                      imageData.base64,
                      imageData.mediaType,
                      filename,
                      imageData.dimensions,
                      imageData.path
                    );
                  }
                  const nonImageLines = lines.filter(
                    (line) => !isImageFilePath(line)
                  );
                  if (nonImageLines.length > 0 && onPaste2) {
                    onPaste2(nonImageLines.join("\n"));
                  }
                  setIsPasting2(false);
                } else if (isTempScreenshot && isMacOS2) {
                  checkClipboardForImage2();
                } else {
                  if (onPaste2) {
                    onPaste2(pastedText);
                  }
                  setIsPasting2(false);
                }
              });
              return { chunks: [], timeoutId: null };
            }
            if (isMacOS2 && onImagePaste2 && pastedText.length === 0) {
              checkClipboardForImage2();
              return { chunks: [], timeoutId: null };
            }
            if (onPaste2) {
              onPaste2(pastedText);
            }
            setIsPasting2(false);
            return { chunks: [], timeoutId: null };
          });
        },
        PASTE_COMPLETION_TIMEOUT_MS,
        setPasteState,
        onImagePaste,
        onPaste,
        setIsPasting,
        checkClipboardForImage,
        isMacOS,
        pastePendingRef
      );
    },
    [checkClipboardForImage, isMacOS, onImagePaste, onPaste]
  );
  const wrappedOnInput = (input, key, event) => {
    const isFromPaste = event.keypress.isPasted;
    if (isFromPaste) {
      setIsPasting(true);
    }
    const hasImageFilePath = input.split(/ (?=\/|[A-Za-z]:\\)/).flatMap((part) => part.split("\n")).some((line) => isImageFilePath(line.trim()));
    if (isFromPaste && input.length === 0 && isMacOS && onImagePaste) {
      checkClipboardForImage();
      setIsPasting(false);
      return;
    }
    const shouldHandleAsPaste = onPaste && (input.length > PASTE_THRESHOLD || pastePendingRef.current || hasImageFilePath || isFromPaste);
    if (shouldHandleAsPaste) {
      pastePendingRef.current = true;
      setPasteState(({ chunks, timeoutId }) => {
        return {
          chunks: [...chunks, input],
          timeoutId: resetPasteTimeout(timeoutId)
        };
      });
      return;
    }
    onInput(input, key);
    if (input.length > 10) {
      setIsPasting(false);
    }
  };
  return {
    wrappedOnInput,
    pasteState,
    isPasting
  };
}
export {
  usePasteHandler
};
