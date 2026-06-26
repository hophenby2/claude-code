import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { pathToFileURL } from "url";
import Link from "../../ink/components/Link.js";
import { supportsHyperlinks } from "../../ink/supports-hyperlinks.js";
import { Box, Text } from "../../ink.js";
import { getStoredImagePath } from "../../utils/imageStore.js";
import { MessageResponse } from "../MessageResponse.js";
function UserImageMessage(t0) {
  const $ = _c(7);
  const {
    imageId,
    addMargin
  } = t0;
  const label = imageId ? `[Image #${imageId}]` : "[Image]";
  let t1;
  if ($[0] !== imageId || $[1] !== label) {
    const imagePath = imageId ? getStoredImagePath(imageId) : null;
    t1 = imagePath && supportsHyperlinks() ? /* @__PURE__ */ jsx(Link, { url: pathToFileURL(imagePath).href, children: /* @__PURE__ */ jsx(Text, { children: label }) }) : /* @__PURE__ */ jsx(Text, { children: label });
    $[0] = imageId;
    $[1] = label;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  const content = t1;
  if (addMargin) {
    let t22;
    if ($[3] !== content) {
      t22 = /* @__PURE__ */ jsx(Box, { marginTop: 1, children: content });
      $[3] = content;
      $[4] = t22;
    } else {
      t22 = $[4];
    }
    return t22;
  }
  let t2;
  if ($[5] !== content) {
    t2 = /* @__PURE__ */ jsx(MessageResponse, { children: content });
    $[5] = content;
    $[6] = t2;
  } else {
    t2 = $[6];
  }
  return t2;
}
export {
  UserImageMessage
};
