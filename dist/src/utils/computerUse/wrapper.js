import { bindSessionContext, DEFAULT_GRANT_FLAGS } from "@ant/computer-use-mcp";
import * as React from "react";
import { getSessionId } from "../../bootstrap/state.js";
import { ComputerUseApproval } from "../../components/permissions/ComputerUseApproval/ComputerUseApproval.js";
import { logForDebugging } from "../debug.js";
import { checkComputerUseLock, tryAcquireComputerUseLock } from "./computerUseLock.js";
import { registerEscHotkey } from "./escHotkey.js";
import { getChicagoCoordinateMode } from "./gates.js";
import { getComputerUseHostAdapter } from "./hostAdapter.js";
import { getComputerUseMCPRenderingOverrides } from "./toolRendering.js";
let binding;
let currentToolUseContext;
function tuc() {
  return currentToolUseContext;
}
function formatLockHeld(holder) {
  return `Computer use is in use by another Claude session (${holder.slice(0, 8)}\u2026). Wait for that session to finish or run /exit there.`;
}
function buildSessionContext() {
  return {
    // ── Read state fresh via the per-call ref ─────────────────────────────
    getAllowedApps: () => tuc().getAppState().computerUseMcpState?.allowedApps ?? [],
    getGrantFlags: () => tuc().getAppState().computerUseMcpState?.grantFlags ?? DEFAULT_GRANT_FLAGS,
    // cc-2 has no Settings page for user-denied apps yet.
    getUserDeniedBundleIds: () => [],
    getSelectedDisplayId: () => tuc().getAppState().computerUseMcpState?.selectedDisplayId,
    getDisplayPinnedByModel: () => tuc().getAppState().computerUseMcpState?.displayPinnedByModel ?? false,
    getDisplayResolvedForApps: () => tuc().getAppState().computerUseMcpState?.displayResolvedForApps,
    getLastScreenshotDims: () => {
      const d = tuc().getAppState().computerUseMcpState?.lastScreenshotDims;
      return d ? {
        ...d,
        displayId: d.displayId ?? 0,
        originX: d.originX ?? 0,
        originY: d.originY ?? 0
      } : void 0;
    },
    // ── Write-backs ────────────────────────────────────────────────────────
    // `setToolJSX` is guaranteed present — the gate in `main.tsx` excludes
    // non-interactive sessions. The package's `_dialogSignal` (tool-finished
    // dismissal) is irrelevant here: `setToolJSX` blocks the tool call, so
    // the dialog can't outlive it. Ctrl+C is what matters, and
    // `runPermissionDialog` wires that from the per-call ref's abortController.
    onPermissionRequest: (req, _dialogSignal) => runPermissionDialog(req),
    // Package does the merge (dedupe + truthy-only flags). We just persist.
    onAllowedAppsChanged: (apps, flags) => tuc().setAppState((prev) => {
      const cu = prev.computerUseMcpState;
      const prevApps = cu?.allowedApps;
      const prevFlags = cu?.grantFlags;
      const sameApps = prevApps?.length === apps.length && apps.every((a, i) => prevApps[i]?.bundleId === a.bundleId);
      const sameFlags = prevFlags?.clipboardRead === flags.clipboardRead && prevFlags?.clipboardWrite === flags.clipboardWrite && prevFlags?.systemKeyCombos === flags.systemKeyCombos;
      return sameApps && sameFlags ? prev : {
        ...prev,
        computerUseMcpState: {
          ...cu,
          allowedApps: [...apps],
          grantFlags: flags
        }
      };
    }),
    onAppsHidden: (ids) => {
      if (ids.length === 0) return;
      tuc().setAppState((prev) => {
        const cu = prev.computerUseMcpState;
        const existing = cu?.hiddenDuringTurn;
        if (existing && ids.every((id) => existing.has(id))) return prev;
        return {
          ...prev,
          computerUseMcpState: {
            ...cu,
            hiddenDuringTurn: /* @__PURE__ */ new Set([...existing ?? [], ...ids])
          }
        };
      });
    },
    // Resolver writeback only fires under a pin when Swift fell back to main
    // (pinned display unplugged) — the pin is semantically dead, so clear it
    // and the app-set key so the chase chain runs next time. When autoResolve
    // was true, onDisplayResolvedForApps re-sets the key in the same tick.
    onResolvedDisplayUpdated: (id) => tuc().setAppState((prev) => {
      const cu = prev.computerUseMcpState;
      if (cu?.selectedDisplayId === id && !cu.displayPinnedByModel && cu.displayResolvedForApps === void 0) {
        return prev;
      }
      return {
        ...prev,
        computerUseMcpState: {
          ...cu,
          selectedDisplayId: id,
          displayPinnedByModel: false,
          displayResolvedForApps: void 0
        }
      };
    }),
    // switch_display(name) pins; switch_display("auto") unpins and clears the
    // app-set key so the next screenshot auto-resolves fresh.
    onDisplayPinned: (id) => tuc().setAppState((prev) => {
      const cu = prev.computerUseMcpState;
      const pinned = id !== void 0;
      const nextResolvedFor = pinned ? cu?.displayResolvedForApps : void 0;
      if (cu?.selectedDisplayId === id && cu?.displayPinnedByModel === pinned && cu?.displayResolvedForApps === nextResolvedFor) {
        return prev;
      }
      return {
        ...prev,
        computerUseMcpState: {
          ...cu,
          selectedDisplayId: id,
          displayPinnedByModel: pinned,
          displayResolvedForApps: nextResolvedFor
        }
      };
    }),
    onDisplayResolvedForApps: (key) => tuc().setAppState((prev) => {
      const cu = prev.computerUseMcpState;
      if (cu?.displayResolvedForApps === key) return prev;
      return {
        ...prev,
        computerUseMcpState: {
          ...cu,
          displayResolvedForApps: key
        }
      };
    }),
    onScreenshotCaptured: (dims) => tuc().setAppState((prev) => {
      const cu = prev.computerUseMcpState;
      const p = cu?.lastScreenshotDims;
      return p?.width === dims.width && p?.height === dims.height && p?.displayWidth === dims.displayWidth && p?.displayHeight === dims.displayHeight && p?.displayId === dims.displayId && p?.originX === dims.originX && p?.originY === dims.originY ? prev : {
        ...prev,
        computerUseMcpState: {
          ...cu,
          lastScreenshotDims: dims
        }
      };
    }),
    // ── Lock — async, direct file-lock calls ───────────────────────────────
    // No `lockHolderForGate` dance: the package's gate is async now. It
    // awaits `checkCuLock`, and on `holder: undefined` + non-deferring tool
    // awaits `acquireCuLock`. `defersLockAcquire` is the PACKAGE's set —
    // the local copy is gone.
    checkCuLock: async () => {
      const c = await checkComputerUseLock();
      switch (c.kind) {
        case "free":
          return {
            holder: void 0,
            isSelf: false
          };
        case "held_by_self":
          return {
            holder: getSessionId(),
            isSelf: true
          };
        case "blocked":
          return {
            holder: c.by,
            isSelf: false
          };
      }
    },
    // Called only when checkCuLock returned `holder: undefined`. The O_EXCL
    // acquire is atomic — if another process grabbed it in the gap (rare),
    // throw so the tool fails instead of proceeding without the lock.
    // `fresh: false` (re-entrant) shouldn't happen given check said free,
    // but is possible under parallel tool-use interleaving — don't spam the
    // notification in that case.
    acquireCuLock: async () => {
      const r = await tryAcquireComputerUseLock();
      if (r.kind === "blocked") {
        throw new Error(formatLockHeld(r.by));
      }
      if (r.fresh) {
        const escRegistered = registerEscHotkey(() => {
          logForDebugging("[cu-esc] user escape, aborting turn");
          tuc().abortController.abort();
        });
        tuc().sendOSNotification?.({
          message: escRegistered ? "Claude is using your computer \xB7 press Esc to stop" : "Claude is using your computer \xB7 press Ctrl+C to stop",
          notificationType: "computer_use_enter"
        });
      }
    },
    formatLockHeldMessage: formatLockHeld
  };
}
function getOrBind() {
  if (binding) return binding;
  const ctx = buildSessionContext();
  binding = {
    ctx,
    dispatch: bindSessionContext(getComputerUseHostAdapter(), getChicagoCoordinateMode(), ctx)
  };
  return binding;
}
function getComputerUseMCPToolOverrides(toolName) {
  const call = async (args, context) => {
    currentToolUseContext = context;
    const {
      dispatch
    } = getOrBind();
    const {
      telemetry,
      ...result
    } = await dispatch(toolName, args);
    if (telemetry?.error_kind) {
      logForDebugging(`[Computer Use MCP] ${toolName} error_kind=${telemetry.error_kind}`);
    }
    const data = Array.isArray(result.content) ? result.content.map((item) => item.type === "image" ? {
      type: "image",
      source: {
        type: "base64",
        media_type: item.mimeType ?? "image/jpeg",
        data: item.data
      }
    } : {
      type: "text",
      text: item.type === "text" ? item.text : ""
    }) : result.content;
    return {
      data
    };
  };
  return {
    ...getComputerUseMCPRenderingOverrides(toolName),
    call
  };
}
async function runPermissionDialog(req) {
  const context = tuc();
  const setToolJSX = context.setToolJSX;
  if (!setToolJSX) {
    return {
      granted: [],
      denied: [],
      flags: DEFAULT_GRANT_FLAGS
    };
  }
  try {
    return await new Promise((resolve, reject) => {
      const signal = context.abortController.signal;
      if (signal.aborted) {
        reject(new Error("Computer Use permission dialog aborted"));
        return;
      }
      const onAbort = () => {
        signal.removeEventListener("abort", onAbort);
        reject(new Error("Computer Use permission dialog aborted"));
      };
      signal.addEventListener("abort", onAbort);
      setToolJSX({
        jsx: React.createElement(ComputerUseApproval, {
          request: req,
          onDone: (resp) => {
            signal.removeEventListener("abort", onAbort);
            resolve(resp);
          }
        }),
        shouldHidePromptInput: true
      });
    });
  } finally {
    setToolJSX(null);
  }
}
export {
  buildSessionContext,
  getComputerUseMCPToolOverrides
};
