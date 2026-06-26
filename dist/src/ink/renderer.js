import { logForDebugging } from "../utils/debug.js";
import { markDirty } from "./dom.js";
import { consumeAbsoluteRemovedFlag } from "./node-cache.js";
import Output from "./output.js";
import renderNodeToOutput, {
  getScrollDrainNode,
  getScrollHint,
  resetLayoutShifted,
  resetScrollDrainNode,
  resetScrollHint
} from "./render-node-to-output.js";
import { createScreen } from "./screen.js";
function createRenderer(node, stylePool) {
  let output;
  return (options) => {
    const { frontFrame, backFrame, isTTY, terminalWidth, terminalRows } = options;
    const prevScreen = frontFrame.screen;
    const backScreen = backFrame.screen;
    const charPool = backScreen.charPool;
    const hyperlinkPool = backScreen.hyperlinkPool;
    const computedHeight = node.yogaNode?.getComputedHeight();
    const computedWidth = node.yogaNode?.getComputedWidth();
    const hasInvalidHeight = computedHeight === void 0 || !Number.isFinite(computedHeight) || computedHeight < 0;
    const hasInvalidWidth = computedWidth === void 0 || !Number.isFinite(computedWidth) || computedWidth < 0;
    if (!node.yogaNode || hasInvalidHeight || hasInvalidWidth) {
      if (node.yogaNode && (hasInvalidHeight || hasInvalidWidth)) {
        logForDebugging(
          `Invalid yoga dimensions: width=${computedWidth}, height=${computedHeight}, childNodes=${node.childNodes.length}, terminalWidth=${terminalWidth}, terminalRows=${terminalRows}`
        );
      }
      return {
        screen: createScreen(
          terminalWidth,
          0,
          stylePool,
          charPool,
          hyperlinkPool
        ),
        viewport: { width: terminalWidth, height: terminalRows },
        cursor: { x: 0, y: 0, visible: true }
      };
    }
    const width = Math.floor(node.yogaNode.getComputedWidth());
    const yogaHeight = Math.floor(node.yogaNode.getComputedHeight());
    const height = options.altScreen ? terminalRows : yogaHeight;
    if (options.altScreen && yogaHeight > terminalRows) {
      logForDebugging(
        `alt-screen: yoga height ${yogaHeight} > terminalRows ${terminalRows} \u2014 something is rendering outside <AlternateScreen>. Overflow clipped.`,
        { level: "warn" }
      );
    }
    const screen = backScreen ?? createScreen(width, height, stylePool, charPool, hyperlinkPool);
    if (output) {
      output.reset(width, height, screen);
    } else {
      output = new Output({ width, height, stylePool, screen });
    }
    resetLayoutShifted();
    resetScrollHint();
    resetScrollDrainNode();
    const absoluteRemoved = consumeAbsoluteRemovedFlag();
    renderNodeToOutput(node, output, {
      prevScreen: absoluteRemoved || options.prevFrameContaminated ? void 0 : prevScreen
    });
    const renderedScreen = output.get();
    const drainNode = getScrollDrainNode();
    if (drainNode) markDirty(drainNode);
    return {
      scrollHint: options.altScreen ? getScrollHint() : null,
      scrollDrainPending: drainNode !== null,
      screen: renderedScreen,
      viewport: {
        width: terminalWidth,
        // Alt screen: fake viewport.height = rows + 1 so that
        // shouldClearScreen()'s `screen.height >= viewport.height` check
        // (which treats exactly-filling content as "overflows" for
        // scrollback purposes) never fires. Alt-screen content is always
        // exactly `rows` tall (via <Box height={rows}>) but never
        // scrolls — the cursor.y clamp below keeps the cursor-restore
        // from emitting an LF. With the standard diff path, every frame
        // is incremental; no fullResetSequence_CAUSES_FLICKER.
        height: options.altScreen ? terminalRows + 1 : terminalRows
      },
      cursor: {
        x: 0,
        // In the alt screen, keep the cursor inside the viewport. When
        // screen.height === terminalRows exactly (content fills the alt
        // screen), cursor.y = screen.height would trigger log-update's
        // cursor-restore LF at the last row, scrolling one row off the top
        // of the alt buffer and desyncing the diff's cursor model. The
        // cursor is hidden so its position only matters for diff coords.
        y: options.altScreen ? Math.max(0, Math.min(screen.height, terminalRows) - 1) : screen.height,
        // Hide cursor when there's dynamic output to render (only in TTY mode)
        visible: !isTTY || screen.height === 0
      }
    };
  };
}
export {
  createRenderer as default
};
