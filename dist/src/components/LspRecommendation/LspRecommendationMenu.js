import { jsx, jsxs } from "react/jsx-runtime";
import * as React from "react";
import { Box, Text } from "../../ink.js";
import { Select } from "../CustomSelect/select.js";
import { PermissionDialog } from "../permissions/PermissionDialog.js";
const AUTO_DISMISS_MS = 3e4;
function LspRecommendationMenu({
  pluginName,
  pluginDescription,
  fileExtension,
  onResponse
}) {
  const onResponseRef = React.useRef(onResponse);
  onResponseRef.current = onResponse;
  React.useEffect(() => {
    const timeoutId = setTimeout((ref) => ref.current("no"), AUTO_DISMISS_MS, onResponseRef);
    return () => clearTimeout(timeoutId);
  }, []);
  function onSelect(value) {
    switch (value) {
      case "yes":
        onResponse("yes");
        break;
      case "no":
        onResponse("no");
        break;
      case "never":
        onResponse("never");
        break;
      case "disable":
        onResponse("disable");
        break;
    }
  }
  const options = [{
    label: /* @__PURE__ */ jsxs(Text, { children: [
      "Yes, install ",
      /* @__PURE__ */ jsx(Text, { bold: true, children: pluginName })
    ] }),
    value: "yes"
  }, {
    label: "No, not now",
    value: "no"
  }, {
    label: /* @__PURE__ */ jsxs(Text, { children: [
      "Never for ",
      /* @__PURE__ */ jsx(Text, { bold: true, children: pluginName })
    ] }),
    value: "never"
  }, {
    label: "Disable all LSP recommendations",
    value: "disable"
  }];
  return /* @__PURE__ */ jsx(PermissionDialog, { title: "LSP Plugin Recommendation", children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingX: 2, paddingY: 1, children: [
    /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "LSP provides code intelligence like go-to-definition and error checking" }) }),
    /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Plugin:" }),
      /* @__PURE__ */ jsxs(Text, { children: [
        " ",
        pluginName
      ] })
    ] }),
    pluginDescription && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: pluginDescription }) }),
    /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Triggered by:" }),
      /* @__PURE__ */ jsxs(Text, { children: [
        " ",
        fileExtension,
        " files"
      ] })
    ] }),
    /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { children: "Would you like to install this LSP plugin?" }) }),
    /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Select, { options, onChange: onSelect, onCancel: () => onResponse("no") }) })
  ] }) });
}
export {
  LspRecommendationMenu
};
