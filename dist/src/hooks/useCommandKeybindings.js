import { c as _c } from "react/compiler-runtime";
import { useIsModalOverlayActive } from "../context/overlayContext.js";
import { useOptionalKeybindingContext } from "../keybindings/KeybindingContext.js";
import { useKeybindings } from "../keybindings/useKeybinding.js";
const NOOP_HELPERS = {
  setCursorOffset: () => {
  },
  clearBuffer: () => {
  },
  resetHistory: () => {
  }
};
function CommandKeybindingHandlers(t0) {
  const $ = _c(8);
  const {
    onSubmit,
    isActive: t1
  } = t0;
  const isActive = t1 === void 0 ? true : t1;
  const keybindingContext = useOptionalKeybindingContext();
  const isModalOverlayActive = useIsModalOverlayActive();
  let t2;
  bb0: {
    if (!keybindingContext) {
      let t32;
      if ($[0] === /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel")) {
        t32 = /* @__PURE__ */ new Set();
        $[0] = t32;
      } else {
        t32 = $[0];
      }
      t2 = t32;
      break bb0;
    }
    let actions;
    if ($[1] !== keybindingContext.bindings) {
      actions = /* @__PURE__ */ new Set();
      for (const binding of keybindingContext.bindings) {
        if (binding.action?.startsWith("command:")) {
          actions.add(binding.action);
        }
      }
      $[1] = keybindingContext.bindings;
      $[2] = actions;
    } else {
      actions = $[2];
    }
    t2 = actions;
  }
  const commandActions = t2;
  let map;
  if ($[3] !== commandActions || $[4] !== onSubmit) {
    map = {};
    for (const action of commandActions) {
      const commandName = action.slice(8);
      map[action] = () => {
        onSubmit(`/${commandName}`, NOOP_HELPERS, void 0, {
          fromKeybinding: true
        });
      };
    }
    $[3] = commandActions;
    $[4] = onSubmit;
    $[5] = map;
  } else {
    map = $[5];
  }
  const handlers = map;
  const t3 = isActive && !isModalOverlayActive;
  let t4;
  if ($[6] !== t3) {
    t4 = {
      context: "Chat",
      isActive: t3
    };
    $[6] = t3;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  useKeybindings(handlers, t4);
  return null;
}
export {
  CommandKeybindingHandlers
};
