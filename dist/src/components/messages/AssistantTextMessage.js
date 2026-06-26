import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { useContext } from "react";
import { ERROR_MESSAGE_USER_ABORT } from "../../services/compact/compact.js";
import { isRateLimitErrorMessage } from "../../services/rateLimitMessages.js";
import { BLACK_CIRCLE } from "../../constants/figures.js";
import { Box, NoSelect, Text } from "../../ink.js";
import { API_ERROR_MESSAGE_PREFIX, API_TIMEOUT_ERROR_MESSAGE, CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE, CUSTOM_OFF_SWITCH_MESSAGE, INVALID_API_KEY_ERROR_MESSAGE, INVALID_API_KEY_ERROR_MESSAGE_EXTERNAL, ORG_DISABLED_ERROR_MESSAGE_ENV_KEY, ORG_DISABLED_ERROR_MESSAGE_ENV_KEY_WITH_OAUTH, PROMPT_TOO_LONG_ERROR_MESSAGE, startsWithApiErrorPrefix, TOKEN_REVOKED_ERROR_MESSAGE } from "../../services/api/errors.js";
import { isEmptyMessageText, NO_RESPONSE_REQUESTED } from "../../utils/messages.js";
import { getUpgradeMessage } from "../../utils/model/contextWindowUpgradeCheck.js";
import { getDefaultSonnetModel, renderModelName } from "../../utils/model/model.js";
import { isMacOsKeychainLocked } from "../../utils/secureStorage/macOsKeychainStorage.js";
import { CtrlOToExpand } from "../CtrlOToExpand.js";
import { InterruptedByUser } from "../InterruptedByUser.js";
import { Markdown } from "../Markdown.js";
import { MessageResponse } from "../MessageResponse.js";
import { MessageActionsSelectedContext } from "../messageActions.js";
import { RateLimitMessage } from "./RateLimitMessage.js";
const MAX_API_ERROR_CHARS = 1e3;
function InvalidApiKeyMessage() {
  const $ = _c(2);
  let t0;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t0 = isMacOsKeychainLocked();
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const isKeychainLocked = t0;
  let t1;
  if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx(Text, { color: "error", children: INVALID_API_KEY_ERROR_MESSAGE }),
      isKeychainLocked && /* @__PURE__ */ jsx(Text, { dimColor: true, children: "\xB7 Run in another terminal: security unlock-keychain" })
    ] }) });
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}
function AssistantTextMessage(t0) {
  const $ = _c(34);
  const {
    param: t1,
    addMargin,
    shouldShowDot,
    verbose,
    onOpenRateLimitOptions
  } = t0;
  const {
    text
  } = t1;
  const isSelected = useContext(MessageActionsSelectedContext);
  if (isEmptyMessageText(text)) {
    return null;
  }
  if (isRateLimitErrorMessage(text)) {
    let t2;
    if ($[0] !== onOpenRateLimitOptions || $[1] !== text) {
      t2 = /* @__PURE__ */ jsx(RateLimitMessage, { text, onOpenRateLimitOptions });
      $[0] = onOpenRateLimitOptions;
      $[1] = text;
      $[2] = t2;
    } else {
      t2 = $[2];
    }
    return t2;
  }
  switch (text) {
    case NO_RESPONSE_REQUESTED: {
      return null;
    }
    case PROMPT_TOO_LONG_ERROR_MESSAGE: {
      let t2;
      if ($[3] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t2 = getUpgradeMessage("warning");
        $[3] = t2;
      } else {
        t2 = $[3];
      }
      const upgradeHint = t2;
      let t3;
      if ($[4] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t3 = /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsxs(Text, { color: "error", children: [
          "Context limit reached \xB7 /compact or /clear to continue",
          upgradeHint ? ` \xB7 ${upgradeHint}` : ""
        ] }) });
        $[4] = t3;
      } else {
        t3 = $[4];
      }
      return t3;
    }
    case CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE: {
      let t2;
      if ($[5] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t2 = /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { color: "error", children: "Credit balance too low \xB7 Add funds: https://platform.claude.com/settings/billing" }) });
        $[5] = t2;
      } else {
        t2 = $[5];
      }
      return t2;
    }
    case INVALID_API_KEY_ERROR_MESSAGE: {
      let t2;
      if ($[6] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t2 = /* @__PURE__ */ jsx(InvalidApiKeyMessage, {});
        $[6] = t2;
      } else {
        t2 = $[6];
      }
      return t2;
    }
    case INVALID_API_KEY_ERROR_MESSAGE_EXTERNAL: {
      let t2;
      if ($[7] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t2 = /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { color: "error", children: INVALID_API_KEY_ERROR_MESSAGE_EXTERNAL }) });
        $[7] = t2;
      } else {
        t2 = $[7];
      }
      return t2;
    }
    case ORG_DISABLED_ERROR_MESSAGE_ENV_KEY:
    case ORG_DISABLED_ERROR_MESSAGE_ENV_KEY_WITH_OAUTH: {
      let t2;
      if ($[8] !== text) {
        t2 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsx(Text, { color: "error", children: text }) });
        $[8] = text;
        $[9] = t2;
      } else {
        t2 = $[9];
      }
      return t2;
    }
    case TOKEN_REVOKED_ERROR_MESSAGE: {
      let t2;
      if ($[10] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t2 = /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(Text, { color: "error", children: TOKEN_REVOKED_ERROR_MESSAGE }) });
        $[10] = t2;
      } else {
        t2 = $[10];
      }
      return t2;
    }
    case API_TIMEOUT_ERROR_MESSAGE: {
      let t2;
      if ($[11] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t2 = /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsxs(Text, { color: "error", children: [
          API_TIMEOUT_ERROR_MESSAGE,
          process.env.API_TIMEOUT_MS && /* @__PURE__ */ jsxs(Fragment, { children: [
            " ",
            "(API_TIMEOUT_MS=",
            process.env.API_TIMEOUT_MS,
            "ms, try increasing it)"
          ] })
        ] }) });
        $[11] = t2;
      } else {
        t2 = $[11];
      }
      return t2;
    }
    case CUSTOM_OFF_SWITCH_MESSAGE: {
      let t2;
      if ($[12] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t2 = /* @__PURE__ */ jsx(Text, { color: "error", children: "We are experiencing high demand for Opus 4." });
        $[12] = t2;
      } else {
        t2 = $[12];
      }
      let t3;
      if ($[13] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t3 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", gap: 1, children: [
          t2,
          /* @__PURE__ */ jsxs(Text, { children: [
            "To continue immediately, use /model to switch to",
            " ",
            renderModelName(getDefaultSonnetModel()),
            " and continue coding."
          ] })
        ] }) });
        $[13] = t3;
      } else {
        t3 = $[13];
      }
      return t3;
    }
    case ERROR_MESSAGE_USER_ABORT: {
      let t2;
      if ($[14] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t2 = /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(InterruptedByUser, {}) });
        $[14] = t2;
      } else {
        t2 = $[14];
      }
      return t2;
    }
    default: {
      if (startsWithApiErrorPrefix(text)) {
        const truncated = !verbose && text.length > MAX_API_ERROR_CHARS;
        const t22 = text === API_ERROR_MESSAGE_PREFIX ? `${API_ERROR_MESSAGE_PREFIX}: Please wait a moment and try again.` : truncated ? text.slice(0, MAX_API_ERROR_CHARS) + "\u2026" : text;
        let t32;
        if ($[15] !== t22) {
          t32 = /* @__PURE__ */ jsx(Text, { color: "error", children: t22 });
          $[15] = t22;
          $[16] = t32;
        } else {
          t32 = $[16];
        }
        let t42;
        if ($[17] !== truncated) {
          t42 = truncated && /* @__PURE__ */ jsx(CtrlOToExpand, {});
          $[17] = truncated;
          $[18] = t42;
        } else {
          t42 = $[18];
        }
        let t52;
        if ($[19] !== t32 || $[20] !== t42) {
          t52 = /* @__PURE__ */ jsx(MessageResponse, { children: /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
            t32,
            t42
          ] }) });
          $[19] = t32;
          $[20] = t42;
          $[21] = t52;
        } else {
          t52 = $[21];
        }
        return t52;
      }
      const t2 = addMargin ? 1 : 0;
      const t3 = isSelected ? "messageActionsBackground" : void 0;
      let t4;
      if ($[22] !== isSelected || $[23] !== shouldShowDot) {
        t4 = shouldShowDot && /* @__PURE__ */ jsx(NoSelect, { fromLeftEdge: true, minWidth: 2, children: /* @__PURE__ */ jsx(Text, { color: isSelected ? "suggestion" : "text", children: BLACK_CIRCLE }) });
        $[22] = isSelected;
        $[23] = shouldShowDot;
        $[24] = t4;
      } else {
        t4 = $[24];
      }
      let t5;
      if ($[25] !== text) {
        t5 = /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: /* @__PURE__ */ jsx(Markdown, { children: text }) });
        $[25] = text;
        $[26] = t5;
      } else {
        t5 = $[26];
      }
      let t6;
      if ($[27] !== t4 || $[28] !== t5) {
        t6 = /* @__PURE__ */ jsxs(Box, { flexDirection: "row", children: [
          t4,
          t5
        ] });
        $[27] = t4;
        $[28] = t5;
        $[29] = t6;
      } else {
        t6 = $[29];
      }
      let t7;
      if ($[30] !== t2 || $[31] !== t3 || $[32] !== t6) {
        t7 = /* @__PURE__ */ jsx(Box, { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", marginTop: t2, width: "100%", backgroundColor: t3, children: t6 });
        $[30] = t2;
        $[31] = t3;
        $[32] = t6;
        $[33] = t7;
      } else {
        t7 = $[33];
      }
      return t7;
    }
  }
}
export {
  AssistantTextMessage
};
