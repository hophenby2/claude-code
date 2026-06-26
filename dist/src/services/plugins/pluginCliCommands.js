import figures from "figures";
import { errorMessage } from "../../utils/errors.js";
import { gracefulShutdown } from "../../utils/gracefulShutdown.js";
import { logError } from "../../utils/log.js";
import { getManagedPluginNames } from "../../utils/plugins/managedPlugins.js";
import { parsePluginIdentifier } from "../../utils/plugins/pluginIdentifier.js";
import { writeToStdout } from "../../utils/process.js";
import {
  buildPluginTelemetryFields,
  classifyPluginCommandError
} from "../../utils/telemetry/pluginTelemetry.js";
import {
  logEvent
} from "../analytics/index.js";
import {
  disableAllPluginsOp,
  disablePluginOp,
  enablePluginOp,
  installPluginOp,
  uninstallPluginOp,
  updatePluginOp,
  VALID_INSTALLABLE_SCOPES,
  VALID_UPDATE_SCOPES
} from "./pluginOperations.js";
function handlePluginCommandError(error, command, plugin) {
  logError(error);
  const operation = plugin ? `${command} plugin "${plugin}"` : command === "disable-all" ? "disable all plugins" : `${command} plugins`;
  console.error(
    `${figures.cross} Failed to ${operation}: ${errorMessage(error)}`
  );
  const telemetryFields = plugin ? (() => {
    const { name, marketplace } = parsePluginIdentifier(plugin);
    return {
      _PROTO_plugin_name: name,
      ...marketplace && {
        _PROTO_marketplace_name: marketplace
      },
      ...buildPluginTelemetryFields(
        name,
        marketplace,
        getManagedPluginNames()
      )
    };
  })() : {};
  logEvent("tengu_plugin_command_failed", {
    command,
    error_category: classifyPluginCommandError(
      error
    ),
    ...telemetryFields
  });
  process.exit(1);
}
async function installPlugin(plugin, scope = "user") {
  try {
    console.log(`Installing plugin "${plugin}"...`);
    const result = await installPluginOp(plugin, scope);
    if (!result.success) {
      throw new Error(result.message);
    }
    console.log(`${figures.tick} ${result.message}`);
    const { name, marketplace } = parsePluginIdentifier(
      result.pluginId || plugin
    );
    logEvent("tengu_plugin_installed_cli", {
      _PROTO_plugin_name: name,
      ...marketplace && {
        _PROTO_marketplace_name: marketplace
      },
      scope: result.scope || scope,
      install_source: "cli-explicit",
      ...buildPluginTelemetryFields(name, marketplace, getManagedPluginNames())
    });
    process.exit(0);
  } catch (error) {
    handlePluginCommandError(error, "install", plugin);
  }
}
async function uninstallPlugin(plugin, scope = "user", keepData = false) {
  try {
    const result = await uninstallPluginOp(plugin, scope, !keepData);
    if (!result.success) {
      throw new Error(result.message);
    }
    console.log(`${figures.tick} ${result.message}`);
    const { name, marketplace } = parsePluginIdentifier(
      result.pluginId || plugin
    );
    logEvent("tengu_plugin_uninstalled_cli", {
      _PROTO_plugin_name: name,
      ...marketplace && {
        _PROTO_marketplace_name: marketplace
      },
      scope: result.scope || scope,
      ...buildPluginTelemetryFields(name, marketplace, getManagedPluginNames())
    });
    process.exit(0);
  } catch (error) {
    handlePluginCommandError(error, "uninstall", plugin);
  }
}
async function enablePlugin(plugin, scope) {
  try {
    const result = await enablePluginOp(plugin, scope);
    if (!result.success) {
      throw new Error(result.message);
    }
    console.log(`${figures.tick} ${result.message}`);
    const { name, marketplace } = parsePluginIdentifier(
      result.pluginId || plugin
    );
    logEvent("tengu_plugin_enabled_cli", {
      _PROTO_plugin_name: name,
      ...marketplace && {
        _PROTO_marketplace_name: marketplace
      },
      scope: result.scope,
      ...buildPluginTelemetryFields(name, marketplace, getManagedPluginNames())
    });
    process.exit(0);
  } catch (error) {
    handlePluginCommandError(error, "enable", plugin);
  }
}
async function disablePlugin(plugin, scope) {
  try {
    const result = await disablePluginOp(plugin, scope);
    if (!result.success) {
      throw new Error(result.message);
    }
    console.log(`${figures.tick} ${result.message}`);
    const { name, marketplace } = parsePluginIdentifier(
      result.pluginId || plugin
    );
    logEvent("tengu_plugin_disabled_cli", {
      _PROTO_plugin_name: name,
      ...marketplace && {
        _PROTO_marketplace_name: marketplace
      },
      scope: result.scope,
      ...buildPluginTelemetryFields(name, marketplace, getManagedPluginNames())
    });
    process.exit(0);
  } catch (error) {
    handlePluginCommandError(error, "disable", plugin);
  }
}
async function disableAllPlugins() {
  try {
    const result = await disableAllPluginsOp();
    if (!result.success) {
      throw new Error(result.message);
    }
    console.log(`${figures.tick} ${result.message}`);
    logEvent("tengu_plugin_disabled_all_cli", {});
    process.exit(0);
  } catch (error) {
    handlePluginCommandError(error, "disable-all");
  }
}
async function updatePluginCli(plugin, scope) {
  try {
    writeToStdout(
      `Checking for updates for plugin "${plugin}" at ${scope} scope\u2026
`
    );
    const result = await updatePluginOp(plugin, scope);
    if (!result.success) {
      throw new Error(result.message);
    }
    writeToStdout(`${figures.tick} ${result.message}
`);
    if (!result.alreadyUpToDate) {
      const { name, marketplace } = parsePluginIdentifier(
        result.pluginId || plugin
      );
      logEvent("tengu_plugin_updated_cli", {
        _PROTO_plugin_name: name,
        ...marketplace && {
          _PROTO_marketplace_name: marketplace
        },
        old_version: result.oldVersion || "unknown",
        new_version: result.newVersion || "unknown",
        ...buildPluginTelemetryFields(
          name,
          marketplace,
          getManagedPluginNames()
        )
      });
    }
    await gracefulShutdown(0);
  } catch (error) {
    handlePluginCommandError(error, "update", plugin);
  }
}
export {
  VALID_INSTALLABLE_SCOPES,
  VALID_UPDATE_SCOPES,
  disableAllPlugins,
  disablePlugin,
  enablePlugin,
  installPlugin,
  uninstallPlugin,
  updatePluginCli
};
