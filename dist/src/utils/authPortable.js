import { execa } from "execa";
import { getMacOsKeychainStorageServiceName } from "./secureStorage/macOsKeychainHelpers.js";
async function maybeRemoveApiKeyFromMacOSKeychainThrows() {
  if (process.platform === "darwin") {
    const storageServiceName = getMacOsKeychainStorageServiceName();
    const result = await execa(
      `security delete-generic-password -a $USER -s "${storageServiceName}"`,
      { shell: true, reject: false }
    );
    if (result.exitCode !== 0) {
      throw new Error("Failed to delete keychain entry");
    }
  }
}
function normalizeApiKeyForConfig(apiKey) {
  return apiKey.slice(-20);
}
export {
  maybeRemoveApiKeyFromMacOSKeychainThrows,
  normalizeApiKeyForConfig
};
