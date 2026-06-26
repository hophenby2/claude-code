import { logForDebugging } from "../../utils/debug.js";
import { errorMessage, toError } from "../../utils/errors.js";
import { logError } from "../../utils/log.js";
import { getPluginLspServers } from "../../utils/plugins/lspPluginIntegration.js";
import { loadAllPluginsCacheOnly } from "../../utils/plugins/pluginLoader.js";
async function getAllLspServers() {
  const allServers = {};
  try {
    const { enabled: plugins } = await loadAllPluginsCacheOnly();
    const results = await Promise.all(
      plugins.map(async (plugin) => {
        const errors = [];
        try {
          const scopedServers = await getPluginLspServers(plugin, errors);
          return { plugin, scopedServers, errors };
        } catch (e) {
          logForDebugging(
            `Failed to load LSP servers for plugin ${plugin.name}: ${e}`,
            { level: "error" }
          );
          return { plugin, scopedServers: void 0, errors };
        }
      })
    );
    for (const { plugin, scopedServers, errors } of results) {
      const serverCount = scopedServers ? Object.keys(scopedServers).length : 0;
      if (serverCount > 0) {
        Object.assign(allServers, scopedServers);
        logForDebugging(
          `Loaded ${serverCount} LSP server(s) from plugin: ${plugin.name}`
        );
      }
      if (errors.length > 0) {
        logForDebugging(
          `${errors.length} error(s) loading LSP servers from plugin: ${plugin.name}`
        );
      }
    }
    logForDebugging(
      `Total LSP servers loaded: ${Object.keys(allServers).length}`
    );
  } catch (error) {
    logError(toError(error));
    logForDebugging(`Error loading LSP servers: ${errorMessage(error)}`);
  }
  return {
    servers: allServers
  };
}
export {
  getAllLspServers
};
