import { createFallbackStorage } from "./fallbackStorage.js";
import { macOsKeychainStorage } from "./macOsKeychainStorage.js";
import { plainTextStorage } from "./plainTextStorage.js";
function getSecureStorage() {
  if (process.platform === "darwin") {
    return createFallbackStorage(macOsKeychainStorage, plainTextStorage);
  }
  return plainTextStorage;
}
export {
  getSecureStorage
};
