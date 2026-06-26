import { jsx, jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { Box, color, Text, useTheme } from "../../ink.js";
import { plural } from "../../utils/stringUtils.js";
function UnifiedInstalledCell(t0) {
  const $ = _c(142);
  const {
    item,
    isSelected
  } = t0;
  const [theme] = useTheme();
  if (item.type === "plugin") {
    let statusIcon;
    let statusText;
    if (item.pendingToggle) {
      let t15;
      if ($[0] !== theme) {
        t15 = color("suggestion", theme)(figures.arrowRight);
        $[0] = theme;
        $[1] = t15;
      } else {
        t15 = $[1];
      }
      statusIcon = t15;
      statusText = item.pendingToggle === "will-enable" ? "will enable" : "will disable";
    } else {
      if (item.errorCount > 0) {
        let t15;
        if ($[2] !== theme) {
          t15 = color("error", theme)(figures.cross);
          $[2] = theme;
          $[3] = t15;
        } else {
          t15 = $[3];
        }
        statusIcon = t15;
        const t23 = item.errorCount;
        let t33;
        if ($[4] !== item.errorCount) {
          t33 = plural(item.errorCount, "error");
          $[4] = item.errorCount;
          $[5] = t33;
        } else {
          t33 = $[5];
        }
        statusText = `${t23} ${t33}`;
      } else {
        if (!item.isEnabled) {
          let t15;
          if ($[6] !== theme) {
            t15 = color("inactive", theme)(figures.radioOff);
            $[6] = theme;
            $[7] = t15;
          } else {
            t15 = $[7];
          }
          statusIcon = t15;
          statusText = "disabled";
        } else {
          let t15;
          if ($[8] !== theme) {
            t15 = color("success", theme)(figures.tick);
            $[8] = theme;
            $[9] = t15;
          } else {
            t15 = $[9];
          }
          statusIcon = t15;
          statusText = "enabled";
        }
      }
    }
    const t14 = isSelected ? "suggestion" : void 0;
    const t22 = isSelected ? `${figures.pointer} ` : "  ";
    let t32;
    if ($[10] !== t14 || $[11] !== t22) {
      t32 = /* @__PURE__ */ jsx(Text, { color: t14, children: t22 });
      $[10] = t14;
      $[11] = t22;
      $[12] = t32;
    } else {
      t32 = $[12];
    }
    const t42 = isSelected ? "suggestion" : void 0;
    let t52;
    if ($[13] !== item.name || $[14] !== t42) {
      t52 = /* @__PURE__ */ jsx(Text, { color: t42, children: item.name });
      $[13] = item.name;
      $[14] = t42;
      $[15] = t52;
    } else {
      t52 = $[15];
    }
    const t62 = !isSelected;
    let t72;
    if ($[16] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t72 = /* @__PURE__ */ jsx(Text, { backgroundColor: "userMessageBackground", children: "Plugin" });
      $[16] = t72;
    } else {
      t72 = $[16];
    }
    let t82;
    if ($[17] !== t62) {
      t82 = /* @__PURE__ */ jsxs(Text, { dimColor: t62, children: [
        " ",
        t72
      ] });
      $[17] = t62;
      $[18] = t82;
    } else {
      t82 = $[18];
    }
    let t92;
    if ($[19] !== item.marketplace) {
      t92 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        " \xB7 ",
        item.marketplace
      ] });
      $[19] = item.marketplace;
      $[20] = t92;
    } else {
      t92 = $[20];
    }
    const t102 = !isSelected;
    let t112;
    if ($[21] !== statusIcon || $[22] !== t102) {
      t112 = /* @__PURE__ */ jsxs(Text, { dimColor: t102, children: [
        " \xB7 ",
        statusIcon,
        " "
      ] });
      $[21] = statusIcon;
      $[22] = t102;
      $[23] = t112;
    } else {
      t112 = $[23];
    }
    const t122 = !isSelected;
    let t132;
    if ($[24] !== statusText || $[25] !== t122) {
      t132 = /* @__PURE__ */ jsx(Text, { dimColor: t122, children: statusText });
      $[24] = statusText;
      $[25] = t122;
      $[26] = t132;
    } else {
      t132 = $[26];
    }
    let t142;
    if ($[27] !== t112 || $[28] !== t132 || $[29] !== t32 || $[30] !== t52 || $[31] !== t82 || $[32] !== t92) {
      t142 = /* @__PURE__ */ jsxs(Box, { children: [
        t32,
        t52,
        t82,
        t92,
        t112,
        t132
      ] });
      $[27] = t112;
      $[28] = t132;
      $[29] = t32;
      $[30] = t52;
      $[31] = t82;
      $[32] = t92;
      $[33] = t142;
    } else {
      t142 = $[33];
    }
    return t142;
  }
  if (item.type === "flagged-plugin") {
    let t14;
    if ($[34] !== theme) {
      t14 = color("warning", theme)(figures.warning);
      $[34] = theme;
      $[35] = t14;
    } else {
      t14 = $[35];
    }
    const statusIcon_0 = t14;
    const t22 = isSelected ? "suggestion" : void 0;
    const t32 = isSelected ? `${figures.pointer} ` : "  ";
    let t42;
    if ($[36] !== t22 || $[37] !== t32) {
      t42 = /* @__PURE__ */ jsx(Text, { color: t22, children: t32 });
      $[36] = t22;
      $[37] = t32;
      $[38] = t42;
    } else {
      t42 = $[38];
    }
    const t52 = isSelected ? "suggestion" : void 0;
    let t62;
    if ($[39] !== item.name || $[40] !== t52) {
      t62 = /* @__PURE__ */ jsx(Text, { color: t52, children: item.name });
      $[39] = item.name;
      $[40] = t52;
      $[41] = t62;
    } else {
      t62 = $[41];
    }
    const t72 = !isSelected;
    let t82;
    if ($[42] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t82 = /* @__PURE__ */ jsx(Text, { backgroundColor: "userMessageBackground", children: "Plugin" });
      $[42] = t82;
    } else {
      t82 = $[42];
    }
    let t92;
    if ($[43] !== t72) {
      t92 = /* @__PURE__ */ jsxs(Text, { dimColor: t72, children: [
        " ",
        t82
      ] });
      $[43] = t72;
      $[44] = t92;
    } else {
      t92 = $[44];
    }
    let t102;
    if ($[45] !== item.marketplace) {
      t102 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        " \xB7 ",
        item.marketplace
      ] });
      $[45] = item.marketplace;
      $[46] = t102;
    } else {
      t102 = $[46];
    }
    const t112 = !isSelected;
    let t122;
    if ($[47] !== statusIcon_0 || $[48] !== t112) {
      t122 = /* @__PURE__ */ jsxs(Text, { dimColor: t112, children: [
        " \xB7 ",
        statusIcon_0,
        " "
      ] });
      $[47] = statusIcon_0;
      $[48] = t112;
      $[49] = t122;
    } else {
      t122 = $[49];
    }
    const t132 = !isSelected;
    let t142;
    if ($[50] !== t132) {
      t142 = /* @__PURE__ */ jsx(Text, { dimColor: t132, children: "removed" });
      $[50] = t132;
      $[51] = t142;
    } else {
      t142 = $[51];
    }
    let t15;
    if ($[52] !== t102 || $[53] !== t122 || $[54] !== t142 || $[55] !== t42 || $[56] !== t62 || $[57] !== t92) {
      t15 = /* @__PURE__ */ jsxs(Box, { children: [
        t42,
        t62,
        t92,
        t102,
        t122,
        t142
      ] });
      $[52] = t102;
      $[53] = t122;
      $[54] = t142;
      $[55] = t42;
      $[56] = t62;
      $[57] = t92;
      $[58] = t15;
    } else {
      t15 = $[58];
    }
    return t15;
  }
  if (item.type === "failed-plugin") {
    let t14;
    if ($[59] !== theme) {
      t14 = color("error", theme)(figures.cross);
      $[59] = theme;
      $[60] = t14;
    } else {
      t14 = $[60];
    }
    const statusIcon_1 = t14;
    const t22 = item.errorCount;
    let t32;
    if ($[61] !== item.errorCount) {
      t32 = plural(item.errorCount, "error");
      $[61] = item.errorCount;
      $[62] = t32;
    } else {
      t32 = $[62];
    }
    const statusText_0 = `failed to load \xB7 ${t22} ${t32}`;
    const t42 = isSelected ? "suggestion" : void 0;
    const t52 = isSelected ? `${figures.pointer} ` : "  ";
    let t62;
    if ($[63] !== t42 || $[64] !== t52) {
      t62 = /* @__PURE__ */ jsx(Text, { color: t42, children: t52 });
      $[63] = t42;
      $[64] = t52;
      $[65] = t62;
    } else {
      t62 = $[65];
    }
    const t72 = isSelected ? "suggestion" : void 0;
    let t82;
    if ($[66] !== item.name || $[67] !== t72) {
      t82 = /* @__PURE__ */ jsx(Text, { color: t72, children: item.name });
      $[66] = item.name;
      $[67] = t72;
      $[68] = t82;
    } else {
      t82 = $[68];
    }
    const t92 = !isSelected;
    let t102;
    if ($[69] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t102 = /* @__PURE__ */ jsx(Text, { backgroundColor: "userMessageBackground", children: "Plugin" });
      $[69] = t102;
    } else {
      t102 = $[69];
    }
    let t112;
    if ($[70] !== t92) {
      t112 = /* @__PURE__ */ jsxs(Text, { dimColor: t92, children: [
        " ",
        t102
      ] });
      $[70] = t92;
      $[71] = t112;
    } else {
      t112 = $[71];
    }
    let t122;
    if ($[72] !== item.marketplace) {
      t122 = /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        " \xB7 ",
        item.marketplace
      ] });
      $[72] = item.marketplace;
      $[73] = t122;
    } else {
      t122 = $[73];
    }
    const t132 = !isSelected;
    let t142;
    if ($[74] !== statusIcon_1 || $[75] !== t132) {
      t142 = /* @__PURE__ */ jsxs(Text, { dimColor: t132, children: [
        " \xB7 ",
        statusIcon_1,
        " "
      ] });
      $[74] = statusIcon_1;
      $[75] = t132;
      $[76] = t142;
    } else {
      t142 = $[76];
    }
    const t15 = !isSelected;
    let t16;
    if ($[77] !== statusText_0 || $[78] !== t15) {
      t16 = /* @__PURE__ */ jsx(Text, { dimColor: t15, children: statusText_0 });
      $[77] = statusText_0;
      $[78] = t15;
      $[79] = t16;
    } else {
      t16 = $[79];
    }
    let t17;
    if ($[80] !== t112 || $[81] !== t122 || $[82] !== t142 || $[83] !== t16 || $[84] !== t62 || $[85] !== t82) {
      t17 = /* @__PURE__ */ jsxs(Box, { children: [
        t62,
        t82,
        t112,
        t122,
        t142,
        t16
      ] });
      $[80] = t112;
      $[81] = t122;
      $[82] = t142;
      $[83] = t16;
      $[84] = t62;
      $[85] = t82;
      $[86] = t17;
    } else {
      t17 = $[86];
    }
    return t17;
  }
  let statusIcon_2;
  let statusText_1;
  if (item.status === "connected") {
    let t14;
    if ($[87] !== theme) {
      t14 = color("success", theme)(figures.tick);
      $[87] = theme;
      $[88] = t14;
    } else {
      t14 = $[88];
    }
    statusIcon_2 = t14;
    statusText_1 = "connected";
  } else {
    if (item.status === "disabled") {
      let t14;
      if ($[89] !== theme) {
        t14 = color("inactive", theme)(figures.radioOff);
        $[89] = theme;
        $[90] = t14;
      } else {
        t14 = $[90];
      }
      statusIcon_2 = t14;
      statusText_1 = "disabled";
    } else {
      if (item.status === "pending") {
        let t14;
        if ($[91] !== theme) {
          t14 = color("inactive", theme)(figures.radioOff);
          $[91] = theme;
          $[92] = t14;
        } else {
          t14 = $[92];
        }
        statusIcon_2 = t14;
        statusText_1 = "connecting\u2026";
      } else {
        if (item.status === "needs-auth") {
          let t14;
          if ($[93] !== theme) {
            t14 = color("warning", theme)(figures.triangleUpOutline);
            $[93] = theme;
            $[94] = t14;
          } else {
            t14 = $[94];
          }
          statusIcon_2 = t14;
          statusText_1 = "Enter to auth";
        } else {
          let t14;
          if ($[95] !== theme) {
            t14 = color("error", theme)(figures.cross);
            $[95] = theme;
            $[96] = t14;
          } else {
            t14 = $[96];
          }
          statusIcon_2 = t14;
          statusText_1 = "failed";
        }
      }
    }
  }
  if (item.indented) {
    const t14 = isSelected ? "suggestion" : void 0;
    const t22 = isSelected ? `${figures.pointer} ` : "  ";
    let t32;
    if ($[97] !== t14 || $[98] !== t22) {
      t32 = /* @__PURE__ */ jsx(Text, { color: t14, children: t22 });
      $[97] = t14;
      $[98] = t22;
      $[99] = t32;
    } else {
      t32 = $[99];
    }
    const t42 = !isSelected;
    let t52;
    if ($[100] !== t42) {
      t52 = /* @__PURE__ */ jsx(Text, { dimColor: t42, children: "\u2514 " });
      $[100] = t42;
      $[101] = t52;
    } else {
      t52 = $[101];
    }
    const t62 = isSelected ? "suggestion" : void 0;
    let t72;
    if ($[102] !== item.name || $[103] !== t62) {
      t72 = /* @__PURE__ */ jsx(Text, { color: t62, children: item.name });
      $[102] = item.name;
      $[103] = t62;
      $[104] = t72;
    } else {
      t72 = $[104];
    }
    const t82 = !isSelected;
    let t92;
    if ($[105] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
      t92 = /* @__PURE__ */ jsx(Text, { backgroundColor: "userMessageBackground", children: "MCP" });
      $[105] = t92;
    } else {
      t92 = $[105];
    }
    let t102;
    if ($[106] !== t82) {
      t102 = /* @__PURE__ */ jsxs(Text, { dimColor: t82, children: [
        " ",
        t92
      ] });
      $[106] = t82;
      $[107] = t102;
    } else {
      t102 = $[107];
    }
    const t112 = !isSelected;
    let t122;
    if ($[108] !== statusIcon_2 || $[109] !== t112) {
      t122 = /* @__PURE__ */ jsxs(Text, { dimColor: t112, children: [
        " \xB7 ",
        statusIcon_2,
        " "
      ] });
      $[108] = statusIcon_2;
      $[109] = t112;
      $[110] = t122;
    } else {
      t122 = $[110];
    }
    const t132 = !isSelected;
    let t142;
    if ($[111] !== statusText_1 || $[112] !== t132) {
      t142 = /* @__PURE__ */ jsx(Text, { dimColor: t132, children: statusText_1 });
      $[111] = statusText_1;
      $[112] = t132;
      $[113] = t142;
    } else {
      t142 = $[113];
    }
    let t15;
    if ($[114] !== t102 || $[115] !== t122 || $[116] !== t142 || $[117] !== t32 || $[118] !== t52 || $[119] !== t72) {
      t15 = /* @__PURE__ */ jsxs(Box, { children: [
        t32,
        t52,
        t72,
        t102,
        t122,
        t142
      ] });
      $[114] = t102;
      $[115] = t122;
      $[116] = t142;
      $[117] = t32;
      $[118] = t52;
      $[119] = t72;
      $[120] = t15;
    } else {
      t15 = $[120];
    }
    return t15;
  }
  const t1 = isSelected ? "suggestion" : void 0;
  const t2 = isSelected ? `${figures.pointer} ` : "  ";
  let t3;
  if ($[121] !== t1 || $[122] !== t2) {
    t3 = /* @__PURE__ */ jsx(Text, { color: t1, children: t2 });
    $[121] = t1;
    $[122] = t2;
    $[123] = t3;
  } else {
    t3 = $[123];
  }
  const t4 = isSelected ? "suggestion" : void 0;
  let t5;
  if ($[124] !== item.name || $[125] !== t4) {
    t5 = /* @__PURE__ */ jsx(Text, { color: t4, children: item.name });
    $[124] = item.name;
    $[125] = t4;
    $[126] = t5;
  } else {
    t5 = $[126];
  }
  const t6 = !isSelected;
  let t7;
  if ($[127] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
    t7 = /* @__PURE__ */ jsx(Text, { backgroundColor: "userMessageBackground", children: "MCP" });
    $[127] = t7;
  } else {
    t7 = $[127];
  }
  let t8;
  if ($[128] !== t6) {
    t8 = /* @__PURE__ */ jsxs(Text, { dimColor: t6, children: [
      " ",
      t7
    ] });
    $[128] = t6;
    $[129] = t8;
  } else {
    t8 = $[129];
  }
  const t9 = !isSelected;
  let t10;
  if ($[130] !== statusIcon_2 || $[131] !== t9) {
    t10 = /* @__PURE__ */ jsxs(Text, { dimColor: t9, children: [
      " \xB7 ",
      statusIcon_2,
      " "
    ] });
    $[130] = statusIcon_2;
    $[131] = t9;
    $[132] = t10;
  } else {
    t10 = $[132];
  }
  const t11 = !isSelected;
  let t12;
  if ($[133] !== statusText_1 || $[134] !== t11) {
    t12 = /* @__PURE__ */ jsx(Text, { dimColor: t11, children: statusText_1 });
    $[133] = statusText_1;
    $[134] = t11;
    $[135] = t12;
  } else {
    t12 = $[135];
  }
  let t13;
  if ($[136] !== t10 || $[137] !== t12 || $[138] !== t3 || $[139] !== t5 || $[140] !== t8) {
    t13 = /* @__PURE__ */ jsxs(Box, { children: [
      t3,
      t5,
      t8,
      t10,
      t12
    ] });
    $[136] = t10;
    $[137] = t12;
    $[138] = t3;
    $[139] = t5;
    $[140] = t8;
    $[141] = t13;
  } else {
    t13 = $[141];
  }
  return t13;
}
export {
  UnifiedInstalledCell
};
