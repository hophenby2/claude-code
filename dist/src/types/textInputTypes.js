function isValidImagePaste(c) {
  return c.type === "image" && c.content.length > 0;
}
function getImagePasteIds(pastedContents) {
  if (!pastedContents) {
    return void 0;
  }
  const ids = Object.values(pastedContents).filter(isValidImagePaste).map((c) => c.id);
  return ids.length > 0 ? ids : void 0;
}
export {
  getImagePasteIds,
  isValidImagePaste
};
