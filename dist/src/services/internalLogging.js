import { readFile } from "fs/promises";
import memoize from "lodash-es/memoize.js";
import { jsonStringify } from "../utils/slowOperations.js";
import {
  logEvent
} from "./analytics/index.js";
const getKubernetesNamespace = memoize(async () => {
  if (process.env.USER_TYPE !== "ant") {
    return null;
  }
  const namespacePath = "/var/run/secrets/kubernetes.io/serviceaccount/namespace";
  const namespaceNotFound = "namespace not found";
  try {
    const content = await readFile(namespacePath, { encoding: "utf8" });
    return content.trim();
  } catch {
    return namespaceNotFound;
  }
});
const getContainerId = memoize(async () => {
  if (process.env.USER_TYPE !== "ant") {
    return null;
  }
  const containerIdPath = "/proc/self/mountinfo";
  const containerIdNotFound = "container ID not found";
  const containerIdNotFoundInMountinfo = "container ID not found in mountinfo";
  try {
    const mountinfo = (await readFile(containerIdPath, { encoding: "utf8" })).trim();
    const containerIdPattern = /(?:\/docker\/containers\/|\/sandboxes\/)([0-9a-f]{64})/;
    const lines = mountinfo.split("\n");
    for (const line of lines) {
      const match = line.match(containerIdPattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return containerIdNotFoundInMountinfo;
  } catch {
    return containerIdNotFound;
  }
});
async function logPermissionContextForAnts(toolPermissionContext, moment) {
  if (process.env.USER_TYPE !== "ant") {
    return;
  }
  void logEvent("tengu_internal_record_permission_context", {
    moment,
    namespace: await getKubernetesNamespace(),
    toolPermissionContext: jsonStringify(
      toolPermissionContext
    ),
    containerId: await getContainerId()
  });
}
export {
  getContainerId,
  logPermissionContextForAnts
};
