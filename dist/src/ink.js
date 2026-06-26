import { createElement } from "react";
import { ThemeProvider } from "./components/design-system/ThemeProvider.js";
import inkRender, {
  createRoot as inkCreateRoot
} from "./ink/root.js";
function withTheme(node) {
  return createElement(ThemeProvider, null, node);
}
async function render(node, options) {
  return inkRender(withTheme(node), options);
}
async function createRoot(options) {
  const root = await inkCreateRoot(options);
  return {
    ...root,
    render: (node) => root.render(withTheme(node))
  };
}
import { color } from "./components/design-system/color.js";
import { default as default2 } from "./components/design-system/ThemedBox.js";
import { default as default3 } from "./components/design-system/ThemedText.js";
import {
  ThemeProvider as ThemeProvider2,
  usePreviewTheme,
  useTheme,
  useThemeSetting
} from "./components/design-system/ThemeProvider.js";
import { Ansi } from "./ink/Ansi.js";
import { default as default4 } from "./ink/components/Box.js";
import { default as default5 } from "./ink/components/Button.js";
import { default as default6 } from "./ink/components/Link.js";
import { default as default7 } from "./ink/components/Newline.js";
import { NoSelect } from "./ink/components/NoSelect.js";
import { RawAnsi } from "./ink/components/RawAnsi.js";
import { default as default8 } from "./ink/components/Spacer.js";
import { default as default9 } from "./ink/components/Text.js";
import { ClickEvent } from "./ink/events/click-event.js";
import { EventEmitter } from "./ink/events/emitter.js";
import { Event } from "./ink/events/event.js";
import { InputEvent } from "./ink/events/input-event.js";
import { TerminalFocusEvent } from "./ink/events/terminal-focus-event.js";
import { FocusManager } from "./ink/focus.js";
import { useAnimationFrame } from "./ink/hooks/use-animation-frame.js";
import { default as default10 } from "./ink/hooks/use-app.js";
import { default as default11 } from "./ink/hooks/use-input.js";
import { useAnimationTimer, useInterval } from "./ink/hooks/use-interval.js";
import { useSelection } from "./ink/hooks/use-selection.js";
import { default as default12 } from "./ink/hooks/use-stdin.js";
import { useTabStatus } from "./ink/hooks/use-tab-status.js";
import { useTerminalFocus } from "./ink/hooks/use-terminal-focus.js";
import { useTerminalTitle } from "./ink/hooks/use-terminal-title.js";
import { useTerminalViewport } from "./ink/hooks/use-terminal-viewport.js";
import { default as default13 } from "./ink/measure-element.js";
import { supportsTabStatus } from "./ink/termio/osc.js";
import { default as default14 } from "./ink/wrap-text.js";
export {
  Ansi,
  default4 as BaseBox,
  default9 as BaseText,
  default2 as Box,
  default5 as Button,
  ClickEvent,
  Event,
  EventEmitter,
  FocusManager,
  InputEvent,
  default6 as Link,
  default7 as Newline,
  NoSelect,
  RawAnsi,
  default8 as Spacer,
  TerminalFocusEvent,
  default3 as Text,
  ThemeProvider2 as ThemeProvider,
  color,
  createRoot,
  default13 as measureElement,
  render,
  supportsTabStatus,
  useAnimationFrame,
  useAnimationTimer,
  default10 as useApp,
  default11 as useInput,
  useInterval,
  usePreviewTheme,
  useSelection,
  default12 as useStdin,
  useTabStatus,
  useTerminalFocus,
  useTerminalTitle,
  useTerminalViewport,
  useTheme,
  useThemeSetting,
  default14 as wrapText
};
