import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
const feature = (_name) => false;
import { NO_CONTENT_MESSAGE } from "../../constants/messages.js";
import { COMMAND_MESSAGE_TAG, LOCAL_COMMAND_CAVEAT_TAG, TASK_NOTIFICATION_TAG, TEAMMATE_MESSAGE_TAG, TICK_TAG } from "../../constants/xml.js";
import { isAgentSwarmsEnabled } from "../../utils/agentSwarmsEnabled.js";
import { extractTag, INTERRUPT_MESSAGE, INTERRUPT_MESSAGE_FOR_TOOL_USE } from "../../utils/messages.js";
import { InterruptedByUser } from "../InterruptedByUser.js";
import { MessageResponse } from "../MessageResponse.js";
import { UserAgentNotificationMessage } from "./UserAgentNotificationMessage.js";
import { UserBashInputMessage } from "./UserBashInputMessage.js";
import { UserBashOutputMessage } from "./UserBashOutputMessage.js";
import { UserCommandMessage } from "./UserCommandMessage.js";
import { UserLocalCommandOutputMessage } from "./UserLocalCommandOutputMessage.js";
import { UserMemoryInputMessage } from "./UserMemoryInputMessage.js";
import { UserPlanMessage } from "./UserPlanMessage.js";
import { UserPromptMessage } from "./UserPromptMessage.js";
import { UserResourceUpdateMessage } from "./UserResourceUpdateMessage.js";
import { UserTeammateMessage } from "./UserTeammateMessage.js";
function UserTextMessage(t0) {
  const $ = _c(49);
  const {
    addMargin,
    param,
    verbose,
    planContent,
    isTranscriptMode,
    timestamp
  } = t0;
  if (param.text.trim() === NO_CONTENT_MESSAGE) {
    return null;
  }
  if (planContent) {
    let t12;
    if ($[0] !== addMargin || $[1] !== planContent) {
      t12 = /* @__PURE__ */ jsx(UserPlanMessage, { addMargin, planContent });
      $[0] = addMargin;
      $[1] = planContent;
      $[2] = t12;
    } else {
      t12 = $[2];
    }
    return t12;
  }
  if (extractTag(param.text, TICK_TAG)) {
    return null;
  }
  if (param.text.includes(`<${LOCAL_COMMAND_CAVEAT_TAG}>`)) {
    return null;
  }
  if (param.text.startsWith("<bash-stdout") || param.text.startsWith("<bash-stderr")) {
    let t12;
    if ($[3] !== param.text || $[4] !== verbose) {
      t12 = /* @__PURE__ */ jsx(UserBashOutputMessage, { content: param.text, verbose });
      $[3] = param.text;
      $[4] = verbose;
      $[5] = t12;
    } else {
      t12 = $[5];
    }
    return t12;
  }
  if (param.text.startsWith("<local-command-stdout") || param.text.startsWith("<local-command-stderr")) {
    let t12;
    if ($[6] !== param.text) {
      t12 = /* @__PURE__ */ jsx(UserLocalCommandOutputMessage, { content: param.text });
      $[6] = param.text;
      $[7] = t12;
    } else {
      t12 = $[7];
    }
    return t12;
  }
  if (param.text === INTERRUPT_MESSAGE || param.text === INTERRUPT_MESSAGE_FOR_TOOL_USE) {
    let t12;
    if ($[8] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t12 = /* @__PURE__ */ jsx(MessageResponse, { height: 1, children: /* @__PURE__ */ jsx(InterruptedByUser, {}) });
      $[8] = t12;
    } else {
      t12 = $[8];
    }
    return t12;
  }
  if (false) {
    if (param.text.startsWith("<github-webhook-activity>")) {
      let t12;
      if ($[9] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t12 = null;
        $[9] = t12;
      } else {
        t12 = $[9];
      }
      const {
        UserGitHubWebhookMessage
      } = t12;
      let t2;
      if ($[10] !== addMargin || $[11] !== param) {
        t2 = /* @__PURE__ */ jsx(UserGitHubWebhookMessage, { addMargin, param });
        $[10] = addMargin;
        $[11] = param;
        $[12] = t2;
      } else {
        t2 = $[12];
      }
      return t2;
    }
  }
  if (param.text.includes("<bash-input>")) {
    let t12;
    if ($[13] !== addMargin || $[14] !== param) {
      t12 = /* @__PURE__ */ jsx(UserBashInputMessage, { addMargin, param });
      $[13] = addMargin;
      $[14] = param;
      $[15] = t12;
    } else {
      t12 = $[15];
    }
    return t12;
  }
  if (param.text.includes(`<${COMMAND_MESSAGE_TAG}>`)) {
    let t12;
    if ($[16] !== addMargin || $[17] !== param) {
      t12 = /* @__PURE__ */ jsx(UserCommandMessage, { addMargin, param });
      $[16] = addMargin;
      $[17] = param;
      $[18] = t12;
    } else {
      t12 = $[18];
    }
    return t12;
  }
  if (param.text.includes("<user-memory-input>")) {
    let t12;
    if ($[19] !== addMargin || $[20] !== param.text) {
      t12 = /* @__PURE__ */ jsx(UserMemoryInputMessage, { addMargin, text: param.text });
      $[19] = addMargin;
      $[20] = param.text;
      $[21] = t12;
    } else {
      t12 = $[21];
    }
    return t12;
  }
  if (isAgentSwarmsEnabled() && param.text.includes(`<${TEAMMATE_MESSAGE_TAG}`)) {
    let t12;
    if ($[22] !== addMargin || $[23] !== isTranscriptMode || $[24] !== param) {
      t12 = /* @__PURE__ */ jsx(UserTeammateMessage, { addMargin, param, isTranscriptMode });
      $[22] = addMargin;
      $[23] = isTranscriptMode;
      $[24] = param;
      $[25] = t12;
    } else {
      t12 = $[25];
    }
    return t12;
  }
  if (param.text.includes(`<${TASK_NOTIFICATION_TAG}`)) {
    let t12;
    if ($[26] !== addMargin || $[27] !== param) {
      t12 = /* @__PURE__ */ jsx(UserAgentNotificationMessage, { addMargin, param });
      $[26] = addMargin;
      $[27] = param;
      $[28] = t12;
    } else {
      t12 = $[28];
    }
    return t12;
  }
  if (param.text.includes("<mcp-resource-update") || param.text.includes("<mcp-polling-update")) {
    let t12;
    if ($[29] !== addMargin || $[30] !== param) {
      t12 = /* @__PURE__ */ jsx(UserResourceUpdateMessage, { addMargin, param });
      $[29] = addMargin;
      $[30] = param;
      $[31] = t12;
    } else {
      t12 = $[31];
    }
    return t12;
  }
  if (false) {
    if (param.text.includes("<fork-boilerplate>")) {
      let t12;
      if ($[32] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t12 = null;
        $[32] = t12;
      } else {
        t12 = $[32];
      }
      const {
        UserForkBoilerplateMessage
      } = t12;
      let t2;
      if ($[33] !== addMargin || $[34] !== param) {
        t2 = /* @__PURE__ */ jsx(UserForkBoilerplateMessage, { addMargin, param });
        $[33] = addMargin;
        $[34] = param;
        $[35] = t2;
      } else {
        t2 = $[35];
      }
      return t2;
    }
  }
  if (false) {
    if (param.text.includes("<cross-session-message")) {
      let t12;
      if ($[36] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t12 = null;
        $[36] = t12;
      } else {
        t12 = $[36];
      }
      const {
        UserCrossSessionMessage
      } = t12;
      let t2;
      if ($[37] !== addMargin || $[38] !== param) {
        t2 = /* @__PURE__ */ jsx(UserCrossSessionMessage, { addMargin, param });
        $[37] = addMargin;
        $[38] = param;
        $[39] = t2;
      } else {
        t2 = $[39];
      }
      return t2;
    }
  }
  if (false) {
    if (param.text.includes('<channel source="')) {
      let t12;
      if ($[40] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t12 = null;
        $[40] = t12;
      } else {
        t12 = $[40];
      }
      const {
        UserChannelMessage
      } = t12;
      let t2;
      if ($[41] !== addMargin || $[42] !== param) {
        t2 = /* @__PURE__ */ jsx(UserChannelMessage, { addMargin, param });
        $[41] = addMargin;
        $[42] = param;
        $[43] = t2;
      } else {
        t2 = $[43];
      }
      return t2;
    }
  }
  let t1;
  if ($[44] !== addMargin || $[45] !== isTranscriptMode || $[46] !== param || $[47] !== timestamp) {
    t1 = /* @__PURE__ */ jsx(UserPromptMessage, { addMargin, param, isTranscriptMode, timestamp });
    $[44] = addMargin;
    $[45] = isTranscriptMode;
    $[46] = param;
    $[47] = timestamp;
    $[48] = t1;
  } else {
    t1 = $[48];
  }
  return t1;
}
export {
  UserTextMessage
};
