import { API_RESIZE_PARAMS, targetImageSize } from "@ant/computer-use-mcp";
import { logForDebugging } from "../debug.js";
import { errorMessage } from "../errors.js";
import { execFileNoThrow } from "../execFileNoThrow.js";
import { sleep } from "../sleep.js";
import {
  CLI_CU_CAPABILITIES,
  CLI_HOST_BUNDLE_ID,
  getTerminalBundleId
} from "./common.js";
import { drainRunLoop } from "./drainRunLoop.js";
import { notifyExpectedEscape } from "./escHotkey.js";
import { requireComputerUseInput } from "./inputLoader.js";
import { requireComputerUseSwift } from "./swiftLoader.js";
const SCREENSHOT_JPEG_QUALITY = 0.75;
function computeTargetDims(logicalW, logicalH, scaleFactor) {
  const physW = Math.round(logicalW * scaleFactor);
  const physH = Math.round(logicalH * scaleFactor);
  return targetImageSize(physW, physH, API_RESIZE_PARAMS);
}
async function readClipboardViaPbpaste() {
  const { stdout, code } = await execFileNoThrow("pbpaste", [], {
    useCwd: false
  });
  if (code !== 0) {
    throw new Error(`pbpaste exited with code ${code}`);
  }
  return stdout;
}
async function writeClipboardViaPbcopy(text) {
  const { code } = await execFileNoThrow("pbcopy", [], {
    input: text,
    useCwd: false
  });
  if (code !== 0) {
    throw new Error(`pbcopy exited with code ${code}`);
  }
}
function isBareEscape(parts) {
  if (parts.length !== 1) return false;
  const lower = parts[0].toLowerCase();
  return lower === "escape" || lower === "esc";
}
const MOVE_SETTLE_MS = 50;
async function moveAndSettle(input, x, y) {
  await input.moveMouse(x, y, false);
  await sleep(MOVE_SETTLE_MS);
}
async function releasePressed(input, pressed) {
  let k;
  while ((k = pressed.pop()) !== void 0) {
    try {
      await input.key(k, "release");
    } catch {
    }
  }
}
async function withModifiers(input, mods, fn) {
  const pressed = [];
  try {
    for (const m of mods) {
      await input.key(m, "press");
      pressed.push(m);
    }
    return await fn();
  } finally {
    await releasePressed(input, pressed);
  }
}
async function typeViaClipboard(input, text) {
  let saved;
  try {
    saved = await readClipboardViaPbpaste();
  } catch {
    logForDebugging(
      "[computer-use] pbpaste before paste failed; proceeding without restore"
    );
  }
  try {
    await writeClipboardViaPbcopy(text);
    if (await readClipboardViaPbpaste() !== text) {
      throw new Error("Clipboard write did not round-trip.");
    }
    await input.keys(["command", "v"]);
    await sleep(100);
  } finally {
    if (typeof saved === "string") {
      try {
        await writeClipboardViaPbcopy(saved);
      } catch {
        logForDebugging("[computer-use] clipboard restore after paste failed");
      }
    }
  }
}
async function animatedMove(input, targetX, targetY, mouseAnimationEnabled) {
  if (!mouseAnimationEnabled) {
    await moveAndSettle(input, targetX, targetY);
    return;
  }
  const start = await input.mouseLocation();
  const deltaX = targetX - start.x;
  const deltaY = targetY - start.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance < 1) return;
  const durationSec = Math.min(distance / 2e3, 0.5);
  if (durationSec < 0.03) {
    await moveAndSettle(input, targetX, targetY);
    return;
  }
  const frameRate = 60;
  const frameIntervalMs = 1e3 / frameRate;
  const totalFrames = Math.floor(durationSec * frameRate);
  for (let frame = 1; frame <= totalFrames; frame++) {
    const t = frame / totalFrames;
    const eased = 1 - Math.pow(1 - t, 3);
    await input.moveMouse(
      Math.round(start.x + deltaX * eased),
      Math.round(start.y + deltaY * eased),
      false
    );
    if (frame < totalFrames) {
      await sleep(frameIntervalMs);
    }
  }
  await sleep(MOVE_SETTLE_MS);
}
function createCliExecutor(opts) {
  if (process.platform !== "darwin") {
    throw new Error(
      `createCliExecutor called on ${process.platform}. Computer control is macOS-only.`
    );
  }
  const cu = requireComputerUseSwift();
  const { getMouseAnimationEnabled, getHideBeforeActionEnabled } = opts;
  const terminalBundleId = getTerminalBundleId();
  const surrogateHost = terminalBundleId ?? CLI_HOST_BUNDLE_ID;
  const withoutTerminal = (allowed) => terminalBundleId === null ? [...allowed] : allowed.filter((id) => id !== terminalBundleId);
  logForDebugging(
    terminalBundleId ? `[computer-use] terminal ${terminalBundleId} \u2192 surrogate host (hide-exempt, activate-skip, screenshot-excluded)` : "[computer-use] terminal not detected; falling back to sentinel host"
  );
  return {
    capabilities: {
      ...CLI_CU_CAPABILITIES,
      hostBundleId: CLI_HOST_BUNDLE_ID
    },
    // ── Pre-action sequence (hide + defocus) ────────────────────────────
    async prepareForAction(allowlistBundleIds, displayId) {
      if (!getHideBeforeActionEnabled()) {
        return [];
      }
      return drainRunLoop(async () => {
        try {
          const result = await cu.apps.prepareDisplay(
            allowlistBundleIds,
            surrogateHost,
            displayId
          );
          if (result.activated) {
            logForDebugging(
              `[computer-use] prepareForAction: activated ${result.activated}`
            );
          }
          return result.hidden;
        } catch (err) {
          logForDebugging(
            `[computer-use] prepareForAction failed; continuing to action: ${errorMessage(err)}`,
            { level: "warn" }
          );
          return [];
        }
      });
    },
    async previewHideSet(allowlistBundleIds, displayId) {
      return cu.apps.previewHideSet(
        [...allowlistBundleIds, surrogateHost],
        displayId
      );
    },
    // ── Display ──────────────────────────────────────────────────────────
    async getDisplaySize(displayId) {
      return cu.display.getSize(displayId);
    },
    async listDisplays() {
      return cu.display.listAll();
    },
    async findWindowDisplays(bundleIds) {
      return cu.apps.findWindowDisplays(bundleIds);
    },
    async resolvePrepareCapture(opts2) {
      const d = cu.display.getSize(opts2.preferredDisplayId);
      const [targetW, targetH] = computeTargetDims(
        d.width,
        d.height,
        d.scaleFactor
      );
      return drainRunLoop(
        () => cu.resolvePrepareCapture(
          withoutTerminal(opts2.allowedBundleIds),
          surrogateHost,
          SCREENSHOT_JPEG_QUALITY,
          targetW,
          targetH,
          opts2.preferredDisplayId,
          opts2.autoResolve,
          opts2.doHide
        )
      );
    },
    /**
     * Pre-size to `targetImageSize` output so the API transcoder's early-return
     * fires — no server-side resize, `scaleCoord` stays coherent. See
     * packages/desktop/computer-use-mcp/COORDINATES.md.
     */
    async screenshot(opts2) {
      const d = cu.display.getSize(opts2.displayId);
      const [targetW, targetH] = computeTargetDims(
        d.width,
        d.height,
        d.scaleFactor
      );
      return drainRunLoop(
        () => cu.screenshot.captureExcluding(
          withoutTerminal(opts2.allowedBundleIds),
          SCREENSHOT_JPEG_QUALITY,
          targetW,
          targetH,
          opts2.displayId
        )
      );
    },
    async zoom(regionLogical, allowedBundleIds, displayId) {
      const d = cu.display.getSize(displayId);
      const [outW, outH] = computeTargetDims(
        regionLogical.w,
        regionLogical.h,
        d.scaleFactor
      );
      return drainRunLoop(
        () => cu.screenshot.captureRegion(
          withoutTerminal(allowedBundleIds),
          regionLogical.x,
          regionLogical.y,
          regionLogical.w,
          regionLogical.h,
          outW,
          outH,
          SCREENSHOT_JPEG_QUALITY,
          displayId
        )
      );
    },
    // ── Keyboard ─────────────────────────────────────────────────────────
    /**
     * xdotool-style sequence e.g. "ctrl+shift+a" → split on '+' and pass to
     * keys(). keys() dispatches to DispatchQueue.main — drainRunLoop pumps
     * CFRunLoop so it resolves. Rust's error-path cleanup (enigo_wrap.rs)
     * releases modifiers on each invocation, so a mid-loop throw leaves
     * nothing stuck. 8ms between iterations — 125Hz USB polling cadence.
     */
    async key(keySequence, repeat) {
      const input = requireComputerUseInput();
      const parts = keySequence.split("+").filter((p) => p.length > 0);
      const isEsc = isBareEscape(parts);
      const n = repeat ?? 1;
      await drainRunLoop(async () => {
        for (let i = 0; i < n; i++) {
          if (i > 0) {
            await sleep(8);
          }
          if (isEsc) {
            notifyExpectedEscape();
          }
          await input.keys(parts);
        }
      });
    },
    async holdKey(keyNames, durationMs) {
      const input = requireComputerUseInput();
      const pressed = [];
      let orphaned = false;
      try {
        await drainRunLoop(async () => {
          for (const k of keyNames) {
            if (orphaned) return;
            if (isBareEscape([k])) {
              notifyExpectedEscape();
            }
            await input.key(k, "press");
            pressed.push(k);
          }
        });
        await sleep(durationMs);
      } finally {
        orphaned = true;
        await drainRunLoop(() => releasePressed(input, pressed));
      }
    },
    async type(text, opts2) {
      const input = requireComputerUseInput();
      if (opts2.viaClipboard) {
        await drainRunLoop(() => typeViaClipboard(input, text));
        return;
      }
      await input.typeText(text);
    },
    readClipboard: readClipboardViaPbpaste,
    writeClipboard: writeClipboardViaPbcopy,
    // ── Mouse ────────────────────────────────────────────────────────────
    async moveMouse(x, y) {
      await moveAndSettle(requireComputerUseInput(), x, y);
    },
    /**
     * Move, then click. Modifiers are press/release bracketed via withModifiers
     * — same pattern as Cowork. AppKit computes NSEvent.clickCount from timing
     * + position proximity, so double/triple click work without setting the
     * CGEvent clickState field. key() inside withModifiers needs the pump;
     * the modifier-less path doesn't.
     */
    async click(x, y, button, count, modifiers) {
      const input = requireComputerUseInput();
      await moveAndSettle(input, x, y);
      if (modifiers && modifiers.length > 0) {
        await drainRunLoop(
          () => withModifiers(
            input,
            modifiers,
            () => input.mouseButton(button, "click", count)
          )
        );
      } else {
        await input.mouseButton(button, "click", count);
      }
    },
    async mouseDown() {
      await requireComputerUseInput().mouseButton("left", "press");
    },
    async mouseUp() {
      await requireComputerUseInput().mouseButton("left", "release");
    },
    async getCursorPosition() {
      return requireComputerUseInput().mouseLocation();
    },
    /**
     * `from === undefined` → drag from current cursor (training's
     * left_click_drag with start_coordinate omitted). Inner `finally`: the
     * button is ALWAYS released even if the move throws — otherwise the
     * user's left button is stuck-pressed until they physically click.
     * 50ms sleep after press: enigo's move_mouse reads NSEvent.pressedMouseButtons
     * to decide .leftMouseDragged vs .mouseMoved; the synthetic leftMouseDown
     * needs a HID-tap round-trip to show up there.
     */
    async drag(from, to) {
      const input = requireComputerUseInput();
      if (from !== void 0) {
        await moveAndSettle(input, from.x, from.y);
      }
      await input.mouseButton("left", "press");
      await sleep(MOVE_SETTLE_MS);
      try {
        await animatedMove(input, to.x, to.y, getMouseAnimationEnabled());
      } finally {
        await input.mouseButton("left", "release");
      }
    },
    /**
     * Move first, then scroll each axis. Vertical-first — it's the common
     * axis; a horizontal failure shouldn't lose the vertical.
     */
    async scroll(x, y, dx, dy) {
      const input = requireComputerUseInput();
      await moveAndSettle(input, x, y);
      if (dy !== 0) {
        await input.mouseScroll(dy, "vertical");
      }
      if (dx !== 0) {
        await input.mouseScroll(dx, "horizontal");
      }
    },
    // ── App management ───────────────────────────────────────────────────
    async getFrontmostApp() {
      const info = requireComputerUseInput().getFrontmostAppInfo();
      if (!info || !info.bundleId) return null;
      return { bundleId: info.bundleId, displayName: info.appName };
    },
    async appUnderPoint(x, y) {
      return cu.apps.appUnderPoint(x, y);
    },
    async listInstalledApps() {
      return drainRunLoop(() => cu.apps.listInstalled());
    },
    async getAppIcon(path) {
      return cu.apps.iconDataUrl(path) ?? void 0;
    },
    async listRunningApps() {
      return cu.apps.listRunning();
    },
    async openApp(bundleId) {
      await cu.apps.open(bundleId);
    }
  };
}
async function unhideComputerUseApps(bundleIds) {
  if (bundleIds.length === 0) return;
  const cu = requireComputerUseSwift();
  await cu.apps.unhide([...bundleIds]);
}
export {
  createCliExecutor,
  unhideComputerUseApps
};
