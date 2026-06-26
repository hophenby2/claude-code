import { isInBundledMode } from "../../utils/bundledMode.js";
let imageProcessorModule = null;
let imageCreatorModule = null;
async function getImageProcessor() {
  if (imageProcessorModule) {
    return imageProcessorModule.default;
  }
  if (isInBundledMode()) {
    try {
      const imageProcessor = await import("image-processor-napi");
      const sharp2 = imageProcessor.sharp || imageProcessor.default;
      imageProcessorModule = { default: sharp2 };
      return sharp2;
    } catch {
      console.warn(
        "Native image processor not available, falling back to sharp"
      );
    }
  }
  const imported = await import("sharp");
  const sharp = unwrapDefault(imported);
  imageProcessorModule = { default: sharp };
  return sharp;
}
async function getImageCreator() {
  if (imageCreatorModule) {
    return imageCreatorModule.default;
  }
  const imported = await import("sharp");
  const sharp = unwrapDefault(imported);
  imageCreatorModule = { default: sharp };
  return sharp;
}
function unwrapDefault(mod) {
  return typeof mod === "function" ? mod : mod.default;
}
export {
  getImageCreator,
  getImageProcessor
};
