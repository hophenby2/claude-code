const feature = (_name) => false;
import "../../bootstrap/state.js";
import "../../services/settingsSync/index.js";
import "../../utils/envUtils.js";
import { refreshActivePlugins } from "../../utils/plugins/refresh.js";
import "../../utils/settings/changeDetector.js";
import { plural } from "../../utils/stringUtils.js";
const call = async (_args, context) => {
  if (false) {
    const applied = await redownloadUserSettings();
    if (applied) {
      settingsChangeDetector.notifyChange("userSettings");
    }
  }
  const r = await refreshActivePlugins(context.setAppState);
  const parts = [
    n(r.enabled_count, "plugin"),
    n(r.command_count, "skill"),
    n(r.agent_count, "agent"),
    n(r.hook_count, "hook"),
    // "plugin MCP/LSP" disambiguates from user-config/built-in servers,
    // which /reload-plugins doesn't touch. Commands/hooks are plugin-only;
    // agent_count is total agents (incl. built-ins). (gh-31321)
    n(r.mcp_count, "plugin MCP server"),
    n(r.lsp_count, "plugin LSP server")
  ];
  let msg = `Reloaded: ${parts.join(" \xB7 ")}`;
  if (r.error_count > 0) {
    msg += `
${n(r.error_count, "error")} during load. Run /doctor for details.`;
  }
  return { type: "text", value: msg };
};
function n(count, noun) {
  return `${count} ${plural(count, noun)}`;
}
export {
  call
};
