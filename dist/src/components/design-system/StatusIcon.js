import { jsxs } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
import figures from "figures";
import { Text } from "../../ink.js";
const STATUS_CONFIG = {
  success: {
    icon: figures.tick,
    color: "success"
  },
  error: {
    icon: figures.cross,
    color: "error"
  },
  warning: {
    icon: figures.warning,
    color: "warning"
  },
  info: {
    icon: figures.info,
    color: "suggestion"
  },
  pending: {
    icon: figures.circle,
    color: void 0
  },
  loading: {
    icon: "\u2026",
    color: void 0
  }
};
function StatusIcon(t0) {
  const $ = _c(5);
  const {
    status,
    withSpace: t1
  } = t0;
  const withSpace = t1 === void 0 ? false : t1;
  const config = STATUS_CONFIG[status];
  const t2 = !config.color;
  const t3 = withSpace && " ";
  let t4;
  if ($[0] !== config.color || $[1] !== config.icon || $[2] !== t2 || $[3] !== t3) {
    t4 = /* @__PURE__ */ jsxs(Text, { color: config.color, dimColor: t2, children: [
      config.icon,
      t3
    ] });
    $[0] = config.color;
    $[1] = config.icon;
    $[2] = t2;
    $[3] = t3;
    $[4] = t4;
  } else {
    t4 = $[4];
  }
  return t4;
}
export {
  StatusIcon
};
