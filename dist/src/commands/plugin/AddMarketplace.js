import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { logEvent } from "../../services/analytics/index.js";
import { ConfigurableShortcutHint } from "../../components/ConfigurableShortcutHint.js";
import { Byline } from "../../components/design-system/Byline.js";
import { KeyboardShortcutHint } from "../../components/design-system/KeyboardShortcutHint.js";
import { Spinner } from "../../components/Spinner.js";
import TextInput from "../../components/TextInput.js";
import { Box, Text } from "../../ink.js";
import { toError } from "../../utils/errors.js";
import { logError } from "../../utils/log.js";
import { clearAllCaches } from "../../utils/plugins/cacheUtils.js";
import { addMarketplaceSource, saveMarketplaceToSettings } from "../../utils/plugins/marketplaceManager.js";
import { parseMarketplaceInput } from "../../utils/plugins/parseMarketplaceInput.js";
function AddMarketplace({
  inputValue,
  setInputValue,
  cursorOffset,
  setCursorOffset,
  error,
  setError,
  result,
  setResult,
  setViewState,
  onAddComplete,
  cliMode = false
}) {
  const hasAttemptedAutoAdd = useRef(false);
  const [isLoading, setLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const handleAdd = async () => {
    const input = inputValue.trim();
    if (!input) {
      setError("Please enter a marketplace source");
      return;
    }
    const parsed = await parseMarketplaceInput(input);
    if (!parsed) {
      setError("Invalid marketplace source format. Try: owner/repo, https://..., or ./path");
      return;
    }
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    try {
      setLoading(true);
      setProgressMessage("");
      const {
        name,
        resolvedSource
      } = await addMarketplaceSource(parsed, (message) => {
        setProgressMessage(message);
      });
      saveMarketplaceToSettings(name, {
        source: resolvedSource
      });
      clearAllCaches();
      let sourceType = parsed.source;
      if (parsed.source === "github") {
        sourceType = parsed.repo;
      }
      logEvent("tengu_marketplace_added", {
        source_type: sourceType
      });
      if (onAddComplete) {
        await onAddComplete();
      }
      setProgressMessage("");
      setLoading(false);
      if (cliMode) {
        setResult(`Successfully added marketplace: ${name}`);
      } else {
        setViewState({
          type: "browse-marketplace",
          targetMarketplace: name
        });
      }
    } catch (err) {
      const error2 = toError(err);
      logError(error2);
      setError(error2.message);
      setProgressMessage("");
      setLoading(false);
      if (cliMode) {
        setResult(`Error: ${error2.message}`);
      } else {
        setResult(null);
      }
    }
  };
  useEffect(() => {
    if (inputValue && !hasAttemptedAutoAdd.current && !error && !result) {
      hasAttemptedAutoAdd.current = true;
      void handleAdd();
    }
  }, []);
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingX: 1, borderStyle: "round", children: [
      /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { bold: true, children: "Add Marketplace" }) }),
      /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        /* @__PURE__ */ jsx(Text, { children: "Enter marketplace source:" }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Examples:" }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: " \xB7 owner/repo (GitHub)" }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: " \xB7 git@github.com:owner/repo.git (SSH)" }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: " \xB7 https://example.com/marketplace.json" }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: " \xB7 ./path/to/marketplace" }),
        /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(TextInput, { value: inputValue, onChange: setInputValue, onSubmit: handleAdd, columns: 80, cursorOffset, onChangeCursorOffset: setCursorOffset, focus: true, showCursor: true }) })
      ] }),
      isLoading && /* @__PURE__ */ jsxs(Box, { marginTop: 1, children: [
        /* @__PURE__ */ jsx(Spinner, {}),
        /* @__PURE__ */ jsx(Text, { children: progressMessage || "Adding marketplace to configuration\u2026" })
      ] }),
      error && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { color: "error", children: error }) }),
      result && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { children: result }) })
    ] }),
    /* @__PURE__ */ jsx(Box, { marginLeft: 3, children: /* @__PURE__ */ jsx(Text, { dimColor: true, italic: true, children: /* @__PURE__ */ jsxs(Byline, { children: [
      /* @__PURE__ */ jsx(KeyboardShortcutHint, { shortcut: "Enter", action: "add" }),
      /* @__PURE__ */ jsx(ConfigurableShortcutHint, { action: "confirm:no", context: "Settings", fallback: "Esc", description: "cancel" })
    ] }) }) })
  ] });
}
export {
  AddMarketplace
};
