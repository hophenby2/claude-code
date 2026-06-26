import indentString from "indent-string";
import { applyTextStyles } from "./colorize.js";
import getMaxWidth from "./get-max-width.js";
import { LayoutDisplay, LayoutEdge } from "./layout/node.js";
import { nodeCache, pendingClears } from "./node-cache.js";
import renderBorder from "./render-border.js";
import {
  squashTextNodesToSegments
} from "./squash-text-nodes.js";
import { isXtermJs } from "./terminal.js";
import { widestLine } from "./widest-line.js";
import wrapText from "./wrap-text.js";
function isXtermJsHost() {
  return process.env.TERM_PROGRAM === "vscode" || isXtermJs();
}
let layoutShifted = false;
function resetLayoutShifted() {
  layoutShifted = false;
}
function didLayoutShift() {
  return layoutShifted;
}
let scrollHint = null;
let absoluteRectsPrev = [];
let absoluteRectsCur = [];
function resetScrollHint() {
  scrollHint = null;
  absoluteRectsPrev = absoluteRectsCur;
  absoluteRectsCur = [];
}
function getScrollHint() {
  return scrollHint;
}
let scrollDrainNode = null;
function resetScrollDrainNode() {
  scrollDrainNode = null;
}
function getScrollDrainNode() {
  return scrollDrainNode;
}
let followScroll = null;
function consumeFollowScroll() {
  const f = followScroll;
  followScroll = null;
  return f;
}
const SCROLL_MIN_PER_FRAME = 4;
const SCROLL_INSTANT_THRESHOLD = 5;
const SCROLL_HIGH_PENDING = 12;
const SCROLL_STEP_MED = 2;
const SCROLL_STEP_HIGH = 3;
const SCROLL_MAX_PENDING = 30;
function drainAdaptive(node, pending, innerHeight) {
  const sign = pending > 0 ? 1 : -1;
  let abs = Math.abs(pending);
  let applied = 0;
  if (abs > SCROLL_MAX_PENDING) {
    applied += sign * (abs - SCROLL_MAX_PENDING);
    abs = SCROLL_MAX_PENDING;
  }
  const step = abs <= SCROLL_INSTANT_THRESHOLD ? abs : abs < SCROLL_HIGH_PENDING ? SCROLL_STEP_MED : SCROLL_STEP_HIGH;
  applied += sign * step;
  const rem = abs - step;
  const cap = Math.max(1, innerHeight - 1);
  const totalAbs = Math.abs(applied);
  if (totalAbs > cap) {
    const excess = totalAbs - cap;
    node.pendingScrollDelta = sign * (rem + excess);
    return sign * cap;
  }
  node.pendingScrollDelta = rem > 0 ? sign * rem : void 0;
  return applied;
}
function drainProportional(node, pending, innerHeight) {
  const abs = Math.abs(pending);
  const cap = Math.max(1, innerHeight - 1);
  const step = Math.min(cap, Math.max(SCROLL_MIN_PER_FRAME, abs * 3 >> 2));
  if (abs <= step) {
    node.pendingScrollDelta = void 0;
    return pending;
  }
  const applied = pending > 0 ? step : -step;
  node.pendingScrollDelta = pending - applied;
  return applied;
}
const OSC = "\x1B]";
const BEL = "\x07";
function wrapWithOsc8Link(text, url) {
  return `${OSC}8;;${url}${BEL}${text}${OSC}8;;${BEL}`;
}
function buildCharToSegmentMap(segments) {
  const map = [];
  for (let i = 0; i < segments.length; i++) {
    const len = segments[i].text.length;
    for (let j = 0; j < len; j++) {
      map.push(i);
    }
  }
  return map;
}
function applyStylesToWrappedText(wrappedPlain, segments, charToSegment, originalPlain, trimEnabled = false) {
  const lines = wrappedPlain.split("\n");
  const resultLines = [];
  let charIndex = 0;
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (trimEnabled && line.length > 0) {
      const lineStartsWithWhitespace = /\s/.test(line[0]);
      const originalHasWhitespace = charIndex < originalPlain.length && /\s/.test(originalPlain[charIndex]);
      if (originalHasWhitespace && !lineStartsWithWhitespace) {
        while (charIndex < originalPlain.length && /\s/.test(originalPlain[charIndex])) {
          charIndex++;
        }
      }
    }
    let styledLine = "";
    let runStart = 0;
    let runSegmentIndex = charToSegment[charIndex] ?? 0;
    for (let i = 0; i < line.length; i++) {
      const currentSegmentIndex = charToSegment[charIndex] ?? runSegmentIndex;
      if (currentSegmentIndex !== runSegmentIndex) {
        const runText2 = line.slice(runStart, i);
        const segment2 = segments[runSegmentIndex];
        if (segment2) {
          let styled = applyTextStyles(runText2, segment2.styles);
          if (segment2.hyperlink) {
            styled = wrapWithOsc8Link(styled, segment2.hyperlink);
          }
          styledLine += styled;
        } else {
          styledLine += runText2;
        }
        runStart = i;
        runSegmentIndex = currentSegmentIndex;
      }
      charIndex++;
    }
    const runText = line.slice(runStart);
    const segment = segments[runSegmentIndex];
    if (segment) {
      let styled = applyTextStyles(runText, segment.styles);
      if (segment.hyperlink) {
        styled = wrapWithOsc8Link(styled, segment.hyperlink);
      }
      styledLine += styled;
    } else {
      styledLine += runText;
    }
    resultLines.push(styledLine);
    if (charIndex < originalPlain.length && originalPlain[charIndex] === "\n") {
      charIndex++;
    }
    if (trimEnabled && lineIdx < lines.length - 1) {
      const nextLine = lines[lineIdx + 1];
      const nextLineFirstChar = nextLine.length > 0 ? nextLine[0] : null;
      while (charIndex < originalPlain.length && /\s/.test(originalPlain[charIndex])) {
        if (nextLineFirstChar !== null && originalPlain[charIndex] === nextLineFirstChar) {
          break;
        }
        charIndex++;
      }
    }
  }
  return resultLines.join("\n");
}
function wrapWithSoftWrap(plainText, maxWidth, textWrap) {
  if (textWrap !== "wrap" && textWrap !== "wrap-trim") {
    return {
      wrapped: wrapText(plainText, maxWidth, textWrap),
      softWrap: void 0
    };
  }
  const origLines = plainText.split("\n");
  const outLines = [];
  const softWrap = [];
  for (const orig of origLines) {
    const pieces = wrapText(orig, maxWidth, textWrap).split("\n");
    for (let i = 0; i < pieces.length; i++) {
      outLines.push(pieces[i]);
      softWrap.push(i > 0);
    }
  }
  return { wrapped: outLines.join("\n"), softWrap };
}
function applyPaddingToText(node, text, softWrap) {
  const yogaNode = node.childNodes[0]?.yogaNode;
  if (yogaNode) {
    const offsetX = yogaNode.getComputedLeft();
    const offsetY = yogaNode.getComputedTop();
    text = "\n".repeat(offsetY) + indentString(text, offsetX);
    if (softWrap && offsetY > 0) {
      softWrap.unshift(...Array(offsetY).fill(false));
    }
  }
  return text;
}
function renderNodeToOutput(node, output, {
  offsetX = 0,
  offsetY = 0,
  prevScreen,
  skipSelfBlit = false,
  inheritedBackgroundColor
}) {
  const { yogaNode } = node;
  if (yogaNode) {
    if (yogaNode.getDisplay() === LayoutDisplay.None) {
      if (node.dirty) {
        const cached2 = nodeCache.get(node);
        if (cached2) {
          output.clear({
            x: Math.floor(cached2.x),
            y: Math.floor(cached2.y),
            width: Math.floor(cached2.width),
            height: Math.floor(cached2.height)
          });
          dropSubtreeCache(node);
          layoutShifted = true;
        }
      }
      return;
    }
    const x = offsetX + yogaNode.getComputedLeft();
    const yogaTop = yogaNode.getComputedTop();
    let y = offsetY + yogaTop;
    const width = yogaNode.getComputedWidth();
    const height = yogaNode.getComputedHeight();
    if (y < 0 && node.style.position === "absolute") {
      y = 0;
    }
    const cached = nodeCache.get(node);
    if (!node.dirty && !skipSelfBlit && node.pendingScrollDelta === void 0 && cached && cached.x === x && cached.y === y && cached.width === width && cached.height === height && prevScreen) {
      const fx = Math.floor(x);
      const fy = Math.floor(y);
      const fw = Math.floor(width);
      const fh = Math.floor(height);
      output.blit(prevScreen, fx, fy, fw, fh);
      if (node.style.position === "absolute") {
        absoluteRectsCur.push(cached);
      }
      blitEscapingAbsoluteDescendants(node, output, prevScreen, fx, fy, fw, fh);
      return;
    }
    const positionChanged = cached !== void 0 && (cached.x !== x || cached.y !== y || cached.width !== width || cached.height !== height);
    if (positionChanged) {
      layoutShifted = true;
    }
    if (cached && (node.dirty || positionChanged)) {
      output.clear(
        {
          x: Math.floor(cached.x),
          y: Math.floor(cached.y),
          width: Math.floor(cached.width),
          height: Math.floor(cached.height)
        },
        node.style.position === "absolute"
      );
    }
    const clears = pendingClears.get(node);
    const hasRemovedChild = clears !== void 0;
    if (hasRemovedChild) {
      layoutShifted = true;
      for (const rect2 of clears) {
        output.clear({
          x: Math.floor(rect2.x),
          y: Math.floor(rect2.y),
          width: Math.floor(rect2.width),
          height: Math.floor(rect2.height)
        });
      }
      pendingClears.delete(node);
    }
    if (height === 0 && siblingSharesY(node, yogaNode)) {
      nodeCache.set(node, { x, y, width, height, top: yogaTop });
      node.dirty = false;
      return;
    }
    if (node.nodeName === "ink-raw-ansi") {
      const text = node.attributes["rawText"];
      if (text) {
        output.write(x, y, text);
      }
    } else if (node.nodeName === "ink-text") {
      const segments = squashTextNodesToSegments(
        node,
        inheritedBackgroundColor ? { backgroundColor: inheritedBackgroundColor } : void 0
      );
      const plainText = segments.map((s) => s.text).join("");
      if (plainText.length > 0) {
        const maxWidth = Math.min(getMaxWidth(yogaNode), output.width - x);
        const textWrap = node.style.textWrap ?? "wrap";
        const needsWrapping = widestLine(plainText) > maxWidth;
        let text;
        let softWrap;
        if (needsWrapping && segments.length === 1) {
          const segment = segments[0];
          const w = wrapWithSoftWrap(plainText, maxWidth, textWrap);
          softWrap = w.softWrap;
          text = w.wrapped.split("\n").map((line) => {
            let styled = applyTextStyles(line, segment.styles);
            if (segment.hyperlink) {
              styled = wrapWithOsc8Link(styled, segment.hyperlink);
            }
            return styled;
          }).join("\n");
        } else if (needsWrapping) {
          const w = wrapWithSoftWrap(plainText, maxWidth, textWrap);
          softWrap = w.softWrap;
          const charToSegment = buildCharToSegmentMap(segments);
          text = applyStylesToWrappedText(
            w.wrapped,
            segments,
            charToSegment,
            plainText,
            textWrap === "wrap-trim"
          );
        } else {
          text = segments.map((segment) => {
            let styledText = applyTextStyles(segment.text, segment.styles);
            if (segment.hyperlink) {
              styledText = wrapWithOsc8Link(styledText, segment.hyperlink);
            }
            return styledText;
          }).join("");
        }
        text = applyPaddingToText(node, text, softWrap);
        output.write(x, y, text, softWrap);
      }
    } else if (node.nodeName === "ink-box") {
      const boxBackgroundColor = node.style.backgroundColor ?? inheritedBackgroundColor;
      if (node.style.noSelect) {
        const boxX = Math.floor(x);
        const fromEdge = node.style.noSelect === "from-left-edge";
        output.noSelect({
          x: fromEdge ? 0 : boxX,
          y: Math.floor(y),
          width: fromEdge ? boxX + Math.floor(width) : Math.floor(width),
          height: Math.floor(height)
        });
      }
      const overflowX = node.style.overflowX ?? node.style.overflow;
      const overflowY = node.style.overflowY ?? node.style.overflow;
      const clipHorizontally = overflowX === "hidden" || overflowX === "scroll";
      const clipVertically = overflowY === "hidden" || overflowY === "scroll";
      const isScrollY = overflowY === "scroll";
      const needsClip = clipHorizontally || clipVertically;
      let y1;
      let y2;
      if (needsClip) {
        const x1 = clipHorizontally ? x + yogaNode.getComputedBorder(LayoutEdge.Left) : void 0;
        const x2 = clipHorizontally ? x + yogaNode.getComputedWidth() - yogaNode.getComputedBorder(LayoutEdge.Right) : void 0;
        y1 = clipVertically ? y + yogaNode.getComputedBorder(LayoutEdge.Top) : void 0;
        y2 = clipVertically ? y + yogaNode.getComputedHeight() - yogaNode.getComputedBorder(LayoutEdge.Bottom) : void 0;
        output.clip({ x1, x2, y1, y2 });
      }
      if (isScrollY) {
        const padTop = yogaNode.getComputedPadding(LayoutEdge.Top);
        const innerHeight = Math.max(
          0,
          (y2 ?? y + height) - (y1 ?? y) - padTop - yogaNode.getComputedPadding(LayoutEdge.Bottom)
        );
        const content = node.childNodes.find((c) => c.yogaNode);
        const contentYoga = content?.yogaNode;
        const scrollHeight = contentYoga?.getComputedHeight() ?? 0;
        const prevScrollHeight = node.scrollHeight ?? scrollHeight;
        const prevInnerHeight = node.scrollViewportHeight ?? innerHeight;
        node.scrollHeight = scrollHeight;
        node.scrollViewportHeight = innerHeight;
        node.scrollViewportTop = (y1 ?? y) + padTop;
        const maxScroll = Math.max(0, scrollHeight - innerHeight);
        if (node.scrollAnchor) {
          const anchorTop = node.scrollAnchor.el.yogaNode?.getComputedTop();
          if (anchorTop != null) {
            node.scrollTop = anchorTop + node.scrollAnchor.offset;
            node.pendingScrollDelta = void 0;
          }
          node.scrollAnchor = void 0;
        }
        const scrollTopBeforeFollow = node.scrollTop ?? 0;
        const sticky = node.stickyScroll ?? Boolean(node.attributes["stickyScroll"]);
        const prevMaxScroll = Math.max(0, prevScrollHeight - prevInnerHeight);
        const grew = scrollHeight >= prevScrollHeight;
        const atBottom = sticky || grew && scrollTopBeforeFollow >= prevMaxScroll;
        if (atBottom && (node.pendingScrollDelta ?? 0) >= 0) {
          node.scrollTop = maxScroll;
          node.pendingScrollDelta = void 0;
          if (node.stickyScroll === false && scrollTopBeforeFollow >= prevMaxScroll) {
            node.stickyScroll = true;
          }
        }
        const followDelta = (node.scrollTop ?? 0) - scrollTopBeforeFollow;
        if (followDelta > 0) {
          const vpTop = node.scrollViewportTop ?? 0;
          followScroll = {
            delta: followDelta,
            viewportTop: vpTop,
            viewportBottom: vpTop + innerHeight - 1
          };
        }
        let cur = node.scrollTop ?? 0;
        const pending = node.pendingScrollDelta;
        const cMin = node.scrollClampMin;
        const cMax = node.scrollClampMax;
        const haveClamp = cMin !== void 0 && cMax !== void 0;
        if (pending !== void 0 && pending !== 0) {
          const pastClamp = haveClamp && (pending < 0 && cur < cMin || pending > 0 && cur > cMax);
          const eff = pastClamp ? Math.min(4, innerHeight >> 3) : innerHeight;
          cur += isXtermJsHost() ? drainAdaptive(node, pending, eff) : drainProportional(node, pending, eff);
        } else if (pending === 0) {
          node.pendingScrollDelta = void 0;
        }
        let scrollTop = Math.max(0, Math.min(cur, maxScroll));
        const clamped = haveClamp ? Math.max(cMin, Math.min(scrollTop, cMax)) : scrollTop;
        node.scrollTop = scrollTop;
        if (scrollTop !== cur) node.pendingScrollDelta = void 0;
        if (node.pendingScrollDelta !== void 0) scrollDrainNode = node;
        scrollTop = clamped;
        if (content && contentYoga) {
          const contentX = x + contentYoga.getComputedLeft();
          const contentY = y + contentYoga.getComputedTop() - scrollTop;
          const contentCached = nodeCache.get(content);
          let hint = null;
          if (contentCached && contentCached.y !== contentY) {
            const delta = contentCached.y - contentY;
            const regionTop = Math.floor(y + contentYoga.getComputedTop());
            const regionBottom = regionTop + innerHeight - 1;
            if (cached?.y === y && cached.height === height && innerHeight > 0 && Math.abs(delta) < innerHeight) {
              hint = { top: regionTop, bottom: regionBottom, delta };
              scrollHint = hint;
            } else {
              layoutShifted = true;
            }
          }
          const scrollHeight2 = contentYoga.getComputedHeight();
          const prevHeight = contentCached?.height ?? scrollHeight2;
          const heightDelta = scrollHeight2 - prevHeight;
          const safeForFastPath = !hint || heightDelta === 0 || hint.delta > 0 && heightDelta === hint.delta;
          if (!safeForFastPath) scrollHint = null;
          if (hint && prevScreen && safeForFastPath) {
            const { top, bottom, delta } = hint;
            const w = Math.floor(width);
            output.blit(prevScreen, Math.floor(x), top, w, bottom - top + 1);
            output.shift(top, bottom, delta);
            const edgeTop = delta > 0 ? bottom - delta + 1 : top;
            const edgeBottom = delta > 0 ? bottom : top - delta - 1;
            output.clear({
              x: Math.floor(x),
              y: edgeTop,
              width: w,
              height: edgeBottom - edgeTop + 1
            });
            output.clip({
              x1: void 0,
              x2: void 0,
              y1: edgeTop,
              y2: edgeBottom + 1
            });
            const dirtyChildren = content.dirty ? new Set(content.childNodes.filter((c) => c.dirty)) : null;
            renderScrolledChildren(
              content,
              output,
              contentX,
              contentY,
              hasRemovedChild,
              void 0,
              // Cull to edge in child-local coords (inverse of contentY offset).
              edgeTop - contentY,
              edgeBottom + 1 - contentY,
              boxBackgroundColor,
              true
            );
            output.unclip();
            if (dirtyChildren) {
              const edgeTopLocal = edgeTop - contentY;
              const edgeBottomLocal = edgeBottom + 1 - contentY;
              const spaces2 = " ".repeat(w);
              let cumHeightShift = 0;
              for (const childNode of content.childNodes) {
                const childElem = childNode;
                const isDirty = dirtyChildren.has(childNode);
                if (!isDirty && cumHeightShift === 0) {
                  if (nodeCache.has(childElem)) continue;
                }
                const cy = childElem.yogaNode;
                if (!cy) continue;
                const childTop = cy.getComputedTop();
                const childH = cy.getComputedHeight();
                const childBottom = childTop + childH;
                if (isDirty) {
                  const prev = nodeCache.get(childElem);
                  cumHeightShift += childH - (prev ? prev.height : 0);
                }
                if (childBottom <= scrollTop || childTop >= scrollTop + innerHeight)
                  continue;
                if (childTop >= edgeTopLocal && childBottom <= edgeBottomLocal)
                  continue;
                const screenY = Math.floor(contentY + childTop);
                if (!isDirty) {
                  const childCached = nodeCache.get(childElem);
                  if (childCached && Math.floor(childCached.y) - delta === screenY) {
                    continue;
                  }
                }
                const screenBottom = Math.min(
                  Math.floor(contentY + childBottom),
                  Math.floor((y1 ?? y) + padTop + innerHeight)
                );
                if (screenY < screenBottom) {
                  const fill = Array(screenBottom - screenY).fill(spaces2).join("\n");
                  output.write(Math.floor(x), screenY, fill);
                  output.clip({
                    x1: void 0,
                    x2: void 0,
                    y1: screenY,
                    y2: screenBottom
                  });
                  renderNodeToOutput(childElem, output, {
                    offsetX: contentX,
                    offsetY: contentY,
                    prevScreen: void 0,
                    inheritedBackgroundColor: boxBackgroundColor
                  });
                  output.unclip();
                }
              }
            }
            const spaces = absoluteRectsPrev.length ? " ".repeat(w) : "";
            for (const r of absoluteRectsPrev) {
              if (r.y >= bottom + 1 || r.y + r.height <= top) continue;
              const shiftedTop = Math.max(top, Math.floor(r.y) - delta);
              const shiftedBottom = Math.min(
                bottom + 1,
                Math.floor(r.y + r.height) - delta
              );
              if (shiftedTop >= edgeTop && shiftedBottom <= edgeBottom + 1)
                continue;
              if (shiftedTop >= shiftedBottom) continue;
              const fill = Array(shiftedBottom - shiftedTop).fill(spaces).join("\n");
              output.write(Math.floor(x), shiftedTop, fill);
              output.clip({
                x1: void 0,
                x2: void 0,
                y1: shiftedTop,
                y2: shiftedBottom
              });
              renderScrolledChildren(
                content,
                output,
                contentX,
                contentY,
                hasRemovedChild,
                void 0,
                shiftedTop - contentY,
                shiftedBottom - contentY,
                boxBackgroundColor,
                true
              );
              output.unclip();
            }
          } else {
            const scrolled = contentCached && contentCached.y !== contentY;
            if (scrolled && y1 !== void 0 && y2 !== void 0) {
              output.clear({
                x: Math.floor(x),
                y: Math.floor(y1),
                width: Math.floor(width),
                height: Math.floor(y2 - y1)
              });
            }
            renderScrolledChildren(
              content,
              output,
              contentX,
              contentY,
              hasRemovedChild,
              scrolled || positionChanged ? void 0 : prevScreen,
              scrollTop,
              scrollTop + innerHeight,
              boxBackgroundColor
            );
          }
          nodeCache.set(content, {
            x: contentX,
            y: contentY,
            width: contentYoga.getComputedWidth(),
            height: contentYoga.getComputedHeight()
          });
          content.dirty = false;
        }
      } else {
        const ownBackgroundColor = node.style.backgroundColor;
        if (ownBackgroundColor || node.style.opaque) {
          const borderLeft = yogaNode.getComputedBorder(LayoutEdge.Left);
          const borderRight = yogaNode.getComputedBorder(LayoutEdge.Right);
          const borderTop = yogaNode.getComputedBorder(LayoutEdge.Top);
          const borderBottom = yogaNode.getComputedBorder(LayoutEdge.Bottom);
          const innerWidth = Math.floor(width) - borderLeft - borderRight;
          const innerHeight = Math.floor(height) - borderTop - borderBottom;
          if (innerWidth > 0 && innerHeight > 0) {
            const spaces = " ".repeat(innerWidth);
            const fillLine = ownBackgroundColor ? applyTextStyles(spaces, { backgroundColor: ownBackgroundColor }) : spaces;
            const fill = Array(innerHeight).fill(fillLine).join("\n");
            output.write(x + borderLeft, y + borderTop, fill);
          }
        }
        renderChildren(
          node,
          output,
          x,
          y,
          hasRemovedChild,
          // backgroundColor and opaque both disable child blit: the fill
          // overwrites the entire interior each render, so any child whose
          // layout position shifted would blit stale cells from prevScreen
          // on top of the fresh fill. Previously opaque kept blit enabled
          // on the assumption that plain-space fill + unchanged children =
          // valid composite, but children CAN reposition (ScrollBox remeasure
          // on re-render → /permissions body blanked on Down arrow, #25436).
          ownBackgroundColor || node.style.opaque ? void 0 : prevScreen,
          boxBackgroundColor
        );
      }
      if (needsClip) {
        output.unclip();
      }
      renderBorder(x, y, node, output);
    } else if (node.nodeName === "ink-root") {
      renderChildren(
        node,
        output,
        x,
        y,
        hasRemovedChild,
        prevScreen,
        inheritedBackgroundColor
      );
    }
    const rect = { x, y, width, height, top: yogaTop };
    nodeCache.set(node, rect);
    if (node.style.position === "absolute") {
      absoluteRectsCur.push(rect);
    }
    node.dirty = false;
  }
}
function renderChildren(node, output, offsetX, offsetY, hasRemovedChild, prevScreen, inheritedBackgroundColor) {
  let seenDirtyChild = false;
  let seenDirtyClipped = false;
  for (const childNode of node.childNodes) {
    const childElem = childNode;
    const wasDirty = childElem.dirty;
    const isAbsolute = childElem.style.position === "absolute";
    renderNodeToOutput(childElem, output, {
      offsetX,
      offsetY,
      prevScreen: hasRemovedChild || seenDirtyChild ? void 0 : prevScreen,
      // Short-circuits on seenDirtyClipped (false in the common case) so
      // the opaque/bg reads don't happen per-child per-frame.
      skipSelfBlit: seenDirtyClipped && isAbsolute && !childElem.style.opaque && childElem.style.backgroundColor === void 0,
      inheritedBackgroundColor
    });
    if (wasDirty && !seenDirtyChild) {
      if (!clipsBothAxes(childElem) || isAbsolute) {
        seenDirtyChild = true;
      } else {
        seenDirtyClipped = true;
      }
    }
  }
}
function clipsBothAxes(node) {
  const ox = node.style.overflowX ?? node.style.overflow;
  const oy = node.style.overflowY ?? node.style.overflow;
  return (ox === "hidden" || ox === "scroll") && (oy === "hidden" || oy === "scroll");
}
function siblingSharesY(node, yogaNode) {
  const parent = node.parentNode;
  if (!parent) return false;
  const myTop = yogaNode.getComputedTop();
  const siblings = parent.childNodes;
  const idx = siblings.indexOf(node);
  for (let i = idx + 1; i < siblings.length; i++) {
    const sib = siblings[i].yogaNode;
    if (!sib) continue;
    return sib.getComputedTop() === myTop;
  }
  for (let i = idx - 1; i >= 0; i--) {
    const sib = siblings[i].yogaNode;
    if (!sib) continue;
    return sib.getComputedTop() === myTop;
  }
  return false;
}
function blitEscapingAbsoluteDescendants(node, output, prevScreen, px, py, pw, ph) {
  const pr = px + pw;
  const pb = py + ph;
  for (const child of node.childNodes) {
    if (child.nodeName === "#text") continue;
    const elem = child;
    if (elem.style.position === "absolute") {
      const cached = nodeCache.get(elem);
      if (cached) {
        absoluteRectsCur.push(cached);
        const cx = Math.floor(cached.x);
        const cy = Math.floor(cached.y);
        const cw = Math.floor(cached.width);
        const ch = Math.floor(cached.height);
        if (cx < px || cy < py || cx + cw > pr || cy + ch > pb) {
          output.blit(prevScreen, cx, cy, cw, ch);
        }
      }
    }
    blitEscapingAbsoluteDescendants(elem, output, prevScreen, px, py, pw, ph);
  }
}
function renderScrolledChildren(node, output, offsetX, offsetY, hasRemovedChild, prevScreen, scrollTopY, scrollBottomY, inheritedBackgroundColor, preserveCulledCache = false) {
  let seenDirtyChild = false;
  let cumHeightShift = 0;
  for (const childNode of node.childNodes) {
    const childElem = childNode;
    const cy = childElem.yogaNode;
    if (cy) {
      const cached = nodeCache.get(childElem);
      let top;
      let height;
      if (cached?.top !== void 0 && !childElem.dirty && cumHeightShift === 0) {
        top = cached.top;
        height = cached.height;
      } else {
        top = cy.getComputedTop();
        height = cy.getComputedHeight();
        if (childElem.dirty) {
          cumHeightShift += height - (cached ? cached.height : 0);
        }
        if (cached) cached.top = top;
      }
      const bottom = top + height;
      if (bottom <= scrollTopY || top >= scrollBottomY) {
        if (!preserveCulledCache) dropSubtreeCache(childElem);
        continue;
      }
    }
    const wasDirty = childElem.dirty;
    renderNodeToOutput(childElem, output, {
      offsetX,
      offsetY,
      prevScreen: hasRemovedChild || seenDirtyChild ? void 0 : prevScreen,
      inheritedBackgroundColor
    });
    if (wasDirty) {
      seenDirtyChild = true;
    }
  }
}
function dropSubtreeCache(node) {
  nodeCache.delete(node);
  for (const child of node.childNodes) {
    if (child.nodeName !== "#text") {
      dropSubtreeCache(child);
    }
  }
}
var render_node_to_output_default = renderNodeToOutput;
export {
  applyStylesToWrappedText,
  buildCharToSegmentMap,
  consumeFollowScroll,
  render_node_to_output_default as default,
  didLayoutShift,
  getScrollDrainNode,
  getScrollHint,
  resetLayoutShifted,
  resetScrollDrainNode,
  resetScrollHint
};
