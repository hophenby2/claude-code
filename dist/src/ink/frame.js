import {
  createScreen
} from "./screen.js";
function emptyFrame(rows, columns, stylePool, charPool, hyperlinkPool) {
  return {
    screen: createScreen(0, 0, stylePool, charPool, hyperlinkPool),
    viewport: { width: columns, height: rows },
    cursor: { x: 0, y: 0, visible: true }
  };
}
function shouldClearScreen(prevFrame, frame) {
  const didResize = frame.viewport.height !== prevFrame.viewport.height || frame.viewport.width !== prevFrame.viewport.width;
  if (didResize) {
    return "resize";
  }
  const currentFrameOverflows = frame.screen.height >= frame.viewport.height;
  const previousFrameOverflowed = prevFrame.screen.height >= prevFrame.viewport.height;
  if (currentFrameOverflows || previousFrameOverflowed) {
    return "offscreen";
  }
  return void 0;
}
export {
  emptyFrame,
  shouldClearScreen
};
