import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import { basename } from "path";
import { toString as qrToString } from "qrcode";
import { useEffect, useState } from "react";
import { getOriginalCwd } from "../bootstrap/state.js";
import { buildActiveFooterText, buildIdleFooterText, FAILED_FOOTER_TEXT, getBridgeStatus } from "../bridge/bridgeStatusUtil.js";
import { BRIDGE_FAILED_INDICATOR, BRIDGE_READY_INDICATOR } from "../constants/figures.js";
import { useRegisterOverlay } from "../context/overlayContext.js";
import { Box, Text, useInput } from "../ink.js";
import { useKeybindings } from "../keybindings/useKeybinding.js";
import { useAppState, useSetAppState } from "../state/AppState.js";
import { saveGlobalConfig } from "../utils/config.js";
import { getBranch } from "../utils/git.js";
import { Dialog } from "./design-system/Dialog.js";
function BridgeDialog(t0) {
  const $ = _c(87);
  const {
    onDone
  } = t0;
  useRegisterOverlay("bridge-dialog");
  const connected = useAppState(_temp);
  const sessionActive = useAppState(_temp2);
  const reconnecting = useAppState(_temp3);
  const connectUrl = useAppState(_temp4);
  const sessionUrl = useAppState(_temp5);
  const error = useAppState(_temp6);
  const explicit = useAppState(_temp7);
  const environmentId = useAppState(_temp8);
  const sessionId = useAppState(_temp9);
  const verbose = useAppState(_temp0);
  const setAppState = useSetAppState();
  const [showQR, setShowQR] = useState(false);
  const [qrText, setQrText] = useState("");
  const [branchName, setBranchName] = useState("");
  let t1;
  if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t1 = basename(getOriginalCwd());
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const repoName = t1;
  let t2;
  let t3;
  if ($[1] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t2 = () => {
      getBranch().then(setBranchName).catch(_temp1);
    };
    t3 = [];
    $[1] = t2;
    $[2] = t3;
  } else {
    t2 = $[1];
    t3 = $[2];
  }
  useEffect(t2, t3);
  const displayUrl = sessionActive ? sessionUrl : connectUrl;
  let t4;
  let t5;
  if ($[3] !== displayUrl || $[4] !== showQR) {
    t4 = () => {
      if (!showQR || !displayUrl) {
        setQrText("");
        return;
      }
      qrToString(displayUrl, {
        type: "utf8",
        errorCorrectionLevel: "L",
        small: true
      }).then(setQrText).catch(() => setQrText(""));
    };
    t5 = [showQR, displayUrl];
    $[3] = displayUrl;
    $[4] = showQR;
    $[5] = t4;
    $[6] = t5;
  } else {
    t4 = $[5];
    t5 = $[6];
  }
  useEffect(t4, t5);
  let t6;
  if ($[7] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t6 = () => {
      setShowQR(_temp10);
    };
    $[7] = t6;
  } else {
    t6 = $[7];
  }
  let t7;
  if ($[8] !== onDone) {
    t7 = {
      "confirm:yes": onDone,
      "confirm:toggle": t6
    };
    $[8] = onDone;
    $[9] = t7;
  } else {
    t7 = $[9];
  }
  let t8;
  if ($[10] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t8 = {
      context: "Confirmation"
    };
    $[10] = t8;
  } else {
    t8 = $[10];
  }
  useKeybindings(t7, t8);
  let t9;
  if ($[11] !== explicit || $[12] !== onDone || $[13] !== setAppState) {
    t9 = (input) => {
      if (input === "d") {
        if (explicit) {
          saveGlobalConfig(_temp11);
        }
        setAppState(_temp12);
        onDone();
      }
    };
    $[11] = explicit;
    $[12] = onDone;
    $[13] = setAppState;
    $[14] = t9;
  } else {
    t9 = $[14];
  }
  useInput(t9);
  let t10;
  if ($[15] !== connected || $[16] !== error || $[17] !== reconnecting || $[18] !== sessionActive) {
    t10 = getBridgeStatus({
      error,
      connected,
      sessionActive,
      reconnecting
    });
    $[15] = connected;
    $[16] = error;
    $[17] = reconnecting;
    $[18] = sessionActive;
    $[19] = t10;
  } else {
    t10 = $[19];
  }
  const {
    label: statusLabel,
    color: statusColor
  } = t10;
  const indicator = error ? BRIDGE_FAILED_INDICATOR : BRIDGE_READY_INDICATOR;
  let T0;
  let T1;
  let footerText;
  let t11;
  let t12;
  let t13;
  let t14;
  let t15;
  let t16;
  let t17;
  if ($[20] !== branchName || $[21] !== displayUrl || $[22] !== environmentId || $[23] !== error || $[24] !== indicator || $[25] !== onDone || $[26] !== qrText || $[27] !== sessionActive || $[28] !== sessionId || $[29] !== showQR || $[30] !== statusColor || $[31] !== statusLabel || $[32] !== verbose) {
    const qrLines = qrText ? qrText.split("\n").filter(_temp13) : [];
    let contextParts;
    if ($[43] !== branchName) {
      contextParts = [];
      if (repoName) {
        contextParts.push(repoName);
      }
      if (branchName) {
        contextParts.push(branchName);
      }
      $[43] = branchName;
      $[44] = contextParts;
    } else {
      contextParts = $[44];
    }
    const contextSuffix = contextParts.length > 0 ? " \xB7 " + contextParts.join(" \xB7 ") : "";
    let t182;
    if ($[45] !== displayUrl || $[46] !== error || $[47] !== sessionActive) {
      t182 = error ? FAILED_FOOTER_TEXT : displayUrl ? sessionActive ? buildActiveFooterText(displayUrl) : buildIdleFooterText(displayUrl) : void 0;
      $[45] = displayUrl;
      $[46] = error;
      $[47] = sessionActive;
      $[48] = t182;
    } else {
      t182 = $[48];
    }
    footerText = t182;
    T1 = Dialog;
    t15 = "Remote Control";
    t16 = onDone;
    t17 = true;
    T0 = Box;
    t11 = "column";
    t12 = 1;
    let t192;
    if ($[49] !== indicator || $[50] !== statusColor || $[51] !== statusLabel) {
      t192 = /* @__PURE__ */ jsxs(Text, { color: statusColor, children: [
        indicator,
        " ",
        statusLabel
      ] });
      $[49] = indicator;
      $[50] = statusColor;
      $[51] = statusLabel;
      $[52] = t192;
    } else {
      t192 = $[52];
    }
    let t202;
    if ($[53] !== contextSuffix) {
      t202 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: contextSuffix });
      $[53] = contextSuffix;
      $[54] = t202;
    } else {
      t202 = $[54];
    }
    let t212;
    if ($[55] !== t192 || $[56] !== t202) {
      t212 = /* @__PURE__ */ jsxs(Text, { children: [
        t192,
        t202
      ] });
      $[55] = t192;
      $[56] = t202;
      $[57] = t212;
    } else {
      t212 = $[57];
    }
    let t22;
    if ($[58] !== error) {
      t22 = error && /* @__PURE__ */ jsx(Text, { color: "error", children: error });
      $[58] = error;
      $[59] = t22;
    } else {
      t22 = $[59];
    }
    let t23;
    if ($[60] !== environmentId || $[61] !== verbose) {
      t23 = verbose && environmentId && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Environment: ",
        environmentId
      ] });
      $[60] = environmentId;
      $[61] = verbose;
      $[62] = t23;
    } else {
      t23 = $[62];
    }
    let t24;
    if ($[63] !== sessionId || $[64] !== verbose) {
      t24 = verbose && sessionId && /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Session: ",
        sessionId
      ] });
      $[63] = sessionId;
      $[64] = verbose;
      $[65] = t24;
    } else {
      t24 = $[65];
    }
    if ($[66] !== t212 || $[67] !== t22 || $[68] !== t23 || $[69] !== t24) {
      t13 = /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        t212,
        t22,
        t23,
        t24
      ] });
      $[66] = t212;
      $[67] = t22;
      $[68] = t23;
      $[69] = t24;
      $[70] = t13;
    } else {
      t13 = $[70];
    }
    t14 = showQR && qrLines.length > 0 && /* @__PURE__ */ jsx(Box, { flexDirection: "column", children: qrLines.map(_temp14) });
    $[20] = branchName;
    $[21] = displayUrl;
    $[22] = environmentId;
    $[23] = error;
    $[24] = indicator;
    $[25] = onDone;
    $[26] = qrText;
    $[27] = sessionActive;
    $[28] = sessionId;
    $[29] = showQR;
    $[30] = statusColor;
    $[31] = statusLabel;
    $[32] = verbose;
    $[33] = T0;
    $[34] = T1;
    $[35] = footerText;
    $[36] = t11;
    $[37] = t12;
    $[38] = t13;
    $[39] = t14;
    $[40] = t15;
    $[41] = t16;
    $[42] = t17;
  } else {
    T0 = $[33];
    T1 = $[34];
    footerText = $[35];
    t11 = $[36];
    t12 = $[37];
    t13 = $[38];
    t14 = $[39];
    t15 = $[40];
    t16 = $[41];
    t17 = $[42];
  }
  let t18;
  if ($[71] !== footerText) {
    t18 = footerText && /* @__PURE__ */ jsx(Text, { dimColor: true, children: footerText });
    $[71] = footerText;
    $[72] = t18;
  } else {
    t18 = $[72];
  }
  let t19;
  if ($[73] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t19 = /* @__PURE__ */ jsx(Text, { dimColor: true, children: "d to disconnect \xB7 space for QR code \xB7 Enter/Esc to close" });
    $[73] = t19;
  } else {
    t19 = $[73];
  }
  let t20;
  if ($[74] !== T0 || $[75] !== t11 || $[76] !== t12 || $[77] !== t13 || $[78] !== t14 || $[79] !== t18) {
    t20 = /* @__PURE__ */ jsxs(T0, { flexDirection: t11, gap: t12, children: [
      t13,
      t14,
      t18,
      t19
    ] });
    $[74] = T0;
    $[75] = t11;
    $[76] = t12;
    $[77] = t13;
    $[78] = t14;
    $[79] = t18;
    $[80] = t20;
  } else {
    t20 = $[80];
  }
  let t21;
  if ($[81] !== T1 || $[82] !== t15 || $[83] !== t16 || $[84] !== t17 || $[85] !== t20) {
    t21 = /* @__PURE__ */ jsx(T1, { title: t15, onCancel: t16, hideInputGuide: t17, children: t20 });
    $[81] = T1;
    $[82] = t15;
    $[83] = t16;
    $[84] = t17;
    $[85] = t20;
    $[86] = t21;
  } else {
    t21 = $[86];
  }
  return t21;
}
function _temp14(line, i) {
  return /* @__PURE__ */ jsx(Text, { children: line }, i);
}
function _temp13(l) {
  return l.length > 0;
}
function _temp12(prev_0) {
  if (!prev_0.replBridgeEnabled) {
    return prev_0;
  }
  return {
    ...prev_0,
    replBridgeEnabled: false
  };
}
function _temp11(current) {
  if (current.remoteControlAtStartup === false) {
    return current;
  }
  return {
    ...current,
    remoteControlAtStartup: false
  };
}
function _temp10(prev) {
  return !prev;
}
function _temp1() {
}
function _temp0(s_8) {
  return s_8.verbose;
}
function _temp9(s_7) {
  return s_7.replBridgeSessionId;
}
function _temp8(s_6) {
  return s_6.replBridgeEnvironmentId;
}
function _temp7(s_5) {
  return s_5.replBridgeExplicit;
}
function _temp6(s_4) {
  return s_4.replBridgeError;
}
function _temp5(s_3) {
  return s_3.replBridgeSessionUrl;
}
function _temp4(s_2) {
  return s_2.replBridgeConnectUrl;
}
function _temp3(s_1) {
  return s_1.replBridgeReconnecting;
}
function _temp2(s_0) {
  return s_0.replBridgeSessionActive;
}
function _temp(s) {
  return s.replBridgeConnected;
}
export {
  BridgeDialog
};
