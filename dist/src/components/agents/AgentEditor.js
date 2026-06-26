import { jsx, jsxs } from "react/jsx-runtime";
import chalk from "chalk";
import figures from "figures";
import { useCallback, useMemo, useState } from "react";
import { useSetAppState } from "../../state/AppState.js";
import { Box, Text } from "../../ink.js";
import { useKeybinding } from "../../keybindings/useKeybinding.js";
import { setAgentColor } from "../../tools/AgentTool/agentColorManager.js";
import { getActiveAgentsFromList, isCustomAgent, isPluginAgent } from "../../tools/AgentTool/loadAgentsDir.js";
import { editFileInEditor } from "../../utils/promptEditor.js";
import { getActualAgentFilePath, updateAgentFile } from "./agentFileUtils.js";
import { ColorPicker } from "./ColorPicker.js";
import { ModelSelector } from "./ModelSelector.js";
import { ToolSelector } from "./ToolSelector.js";
import { getAgentSourceDisplayName } from "./utils.js";
function AgentEditor({
  agent,
  tools,
  onSaved,
  onBack
}) {
  const setAppState = useSetAppState();
  const [editMode, setEditMode] = useState("menu");
  const [selectedMenuIndex, setSelectedMenuIndex] = useState(0);
  const [error, setError] = useState(null);
  const [selectedColor, setSelectedColor] = useState(agent.color);
  const handleOpenInEditor = useCallback(async () => {
    const filePath = getActualAgentFilePath(agent);
    const result = await editFileInEditor(filePath);
    if (result.error) {
      setError(result.error);
    } else {
      onSaved(`Opened ${agent.agentType} in editor. If you made edits, restart to load the latest version.`);
    }
  }, [agent, onSaved]);
  const handleSave = useCallback(async (changes = {}) => {
    const {
      tools: newTools,
      color: newColor,
      model: newModel
    } = changes;
    const finalColor = newColor ?? selectedColor;
    const hasToolsChanged = newTools !== void 0;
    const hasModelChanged = newModel !== void 0;
    const hasColorChanged = finalColor !== agent.color;
    if (!hasToolsChanged && !hasModelChanged && !hasColorChanged) {
      return false;
    }
    try {
      if (!isCustomAgent(agent) && !isPluginAgent(agent)) {
        return false;
      }
      await updateAgentFile(agent, agent.whenToUse, newTools ?? agent.tools, agent.getSystemPrompt(), finalColor, newModel ?? agent.model);
      if (hasColorChanged && finalColor) {
        setAgentColor(agent.agentType, finalColor);
      }
      setAppState((state) => {
        const allAgents = state.agentDefinitions.allAgents.map((a) => a.agentType === agent.agentType ? {
          ...a,
          tools: newTools ?? a.tools,
          color: finalColor,
          model: newModel ?? a.model
        } : a);
        return {
          ...state,
          agentDefinitions: {
            ...state.agentDefinitions,
            activeAgents: getActiveAgentsFromList(allAgents),
            allAgents
          }
        };
      });
      onSaved(`Updated agent: ${chalk.bold(agent.agentType)}`);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save agent");
      return false;
    }
  }, [agent, selectedColor, onSaved, setAppState]);
  const menuItems = useMemo(() => [{
    label: "Open in editor",
    action: handleOpenInEditor
  }, {
    label: "Edit tools",
    action: () => setEditMode("edit-tools")
  }, {
    label: "Edit model",
    action: () => setEditMode("edit-model")
  }, {
    label: "Edit color",
    action: () => setEditMode("edit-color")
  }], [handleOpenInEditor]);
  const handleEscape = useCallback(() => {
    setError(null);
    if (editMode === "menu") {
      onBack();
    } else {
      setEditMode("menu");
    }
  }, [editMode, onBack]);
  const handleMenuKeyDown = useCallback((e) => {
    if (e.key === "up") {
      e.preventDefault();
      setSelectedMenuIndex((index) => Math.max(0, index - 1));
    } else if (e.key === "down") {
      e.preventDefault();
      setSelectedMenuIndex((index_0) => Math.min(menuItems.length - 1, index_0 + 1));
    } else if (e.key === "return") {
      e.preventDefault();
      const selectedItem = menuItems[selectedMenuIndex];
      if (selectedItem) {
        void selectedItem.action();
      }
    }
  }, [menuItems, selectedMenuIndex]);
  useKeybinding("confirm:no", handleEscape, {
    context: "Confirmation"
  });
  const renderMenu = () => /* @__PURE__ */ jsxs(Box, { flexDirection: "column", tabIndex: 0, autoFocus: true, onKeyDown: handleMenuKeyDown, children: [
    /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
      "Source: ",
      getAgentSourceDisplayName(agent.source)
    ] }),
    /* @__PURE__ */ jsx(Box, { marginTop: 1, flexDirection: "column", children: menuItems.map((item, index_1) => /* @__PURE__ */ jsxs(Text, { color: index_1 === selectedMenuIndex ? "suggestion" : void 0, children: [
      index_1 === selectedMenuIndex ? `${figures.pointer} ` : "  ",
      item.label
    ] }, item.label)) }),
    error && /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { color: "error", children: error }) })
  ] });
  switch (editMode) {
    case "menu":
      return renderMenu();
    case "edit-tools":
      return /* @__PURE__ */ jsx(ToolSelector, { tools, initialTools: agent.tools, onComplete: async (finalTools) => {
        setEditMode("menu");
        await handleSave({
          tools: finalTools
        });
      } });
    case "edit-color":
      return /* @__PURE__ */ jsx(ColorPicker, { agentName: agent.agentType, currentColor: selectedColor || agent.color || "automatic", onConfirm: async (color) => {
        setSelectedColor(color);
        setEditMode("menu");
        await handleSave({
          color
        });
      } });
    case "edit-model":
      return /* @__PURE__ */ jsx(ModelSelector, { initialModel: agent.model, onComplete: async (model) => {
        setEditMode("menu");
        await handleSave({
          model
        });
      } });
    default:
      return null;
  }
}
export {
  AgentEditor
};
