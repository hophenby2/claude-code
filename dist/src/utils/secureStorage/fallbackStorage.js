function createFallbackStorage(primary, secondary) {
  return {
    name: `${primary.name}-with-${secondary.name}-fallback`,
    read() {
      const result = primary.read();
      if (result !== null && result !== void 0) {
        return result;
      }
      return secondary.read() || {};
    },
    async readAsync() {
      const result = await primary.readAsync();
      if (result !== null && result !== void 0) {
        return result;
      }
      return await secondary.readAsync() || {};
    },
    update(data) {
      const primaryDataBefore = primary.read();
      const result = primary.update(data);
      if (result.success) {
        if (primaryDataBefore === null) {
          secondary.delete();
        }
        return result;
      }
      const fallbackResult = secondary.update(data);
      if (fallbackResult.success) {
        if (primaryDataBefore !== null) {
          primary.delete();
        }
        return {
          success: true,
          warning: fallbackResult.warning
        };
      }
      return { success: false };
    },
    delete() {
      const primarySuccess = primary.delete();
      const secondarySuccess = secondary.delete();
      return primarySuccess || secondarySuccess;
    }
  };
}
export {
  createFallbackStorage
};
