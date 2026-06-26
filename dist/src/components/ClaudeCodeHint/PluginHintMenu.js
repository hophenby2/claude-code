import { jsx, jsxs } from "react/jsx-runtime";
import * as React from "react";
import { Box, Text } from "../../ink.js";
import { Select } from "../CustomSelect/select.js";
import { PermissionDialog } from "../permissions/PermissionDialog.js";
const AUTO_DISMISS_MS = 3e4;
function PluginHintMenu({
  pluginName,
  pluginDescription,
  marketplaceName,
  sourceCommand,
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
      case "disable":
        onResponse("disable");
        break;
      default:
        onResponse("no");
    }
  }
  const options = [{
    label: /* @__PURE__ */ jsxs(Text, { children: [
      "Yes, install ",
      /* @__PURE__ */ jsx(Text, { bold: true, children: pluginName })
    ] }),
    value: "yes"
  }, {
    label: "No",
    value: "no"
  }, {
    label: "No, and don't show plugin installation hints again",
    value: "disable"
  }];
  return /* @__PURE__ */ jsx(PermissionDialog, { title: "Plugin Recommendation", children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingX: 2, paddingY: 1, children: [
    /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "The ",
      /* @__PURE__ */ jsx(Text, { bold: true, children: sourceCommand }),
      " command suggests installing a plugin."
    ] }) }),
    /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Plugin:" }),
      /* @__PURE__ */ jsxs(Text, { children: [
        " ",
        pluginName
      ] })
    ] }),
    /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsx(Text, { dimColor: true, children: "Marketplace:" }),
      /* @__PURE__ */ jsxs(Text, { children: [
        " ",
        marketplaceName
      ] })
    ] }),
    pluginDescription && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: pluginDescription }) }),
    /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { children: "Would you like to install it?" }) }),
    /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Select, { options, onChange: onSelect, onCancel: () => onResponse("no") }) })
  ] }) });
}
export {
  PluginHintMenu
};
