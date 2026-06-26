import { jsx } from "react/jsx-runtime";
import { c as _c } from "react/compiler-runtime";
const feature = (_name) => false;
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import useStdin from "../../ink/hooks/use-stdin.js";
import { getGlobalConfig, saveGlobalConfig } from "../../utils/config.js";
import { getSystemThemeName } from "../../utils/systemTheme.js";
const DEFAULT_THEME = "dark";
const ThemeContext = createContext({
  themeSetting: DEFAULT_THEME,
  setThemeSetting: () => {
  },
  setPreviewTheme: () => {
  },
  savePreview: () => {
  },
  cancelPreview: () => {
  },
  currentTheme: DEFAULT_THEME
});
function defaultInitialTheme() {
  return getGlobalConfig().theme;
}
function defaultSaveTheme(setting) {
  saveGlobalConfig((current) => ({
    ...current,
    theme: setting
  }));
}
function ThemeProvider({
  children,
  initialState,
  onThemeSave = defaultSaveTheme
}) {
  const [themeSetting, setThemeSetting] = useState(initialState ?? defaultInitialTheme);
  const [previewTheme, setPreviewTheme] = useState(null);
  const [systemTheme, setSystemTheme] = useState(() => (initialState ?? themeSetting) === "auto" ? getSystemThemeName() : "dark");
  const activeSetting = previewTheme ?? themeSetting;
  const {
    internal_querier
  } = useStdin();
  useEffect(() => {
    if (false) {
      if (activeSetting !== "auto" || !internal_querier) return;
      let cleanup;
      let cancelled = false;
      void null.then(({
        watchSystemTheme
      }) => {
        if (cancelled) return;
        cleanup = watchSystemTheme(internal_querier, setSystemTheme);
      });
      return () => {
        cancelled = true;
        cleanup?.();
      };
    }
  }, [activeSetting, internal_querier]);
  const currentTheme = activeSetting === "auto" ? systemTheme : activeSetting;
  const value = useMemo(() => ({
    themeSetting,
    setThemeSetting: (newSetting) => {
      setThemeSetting(newSetting);
      setPreviewTheme(null);
      if (newSetting === "auto") {
        setSystemTheme(getSystemThemeName());
      }
      onThemeSave?.(newSetting);
    },
    setPreviewTheme: (newSetting_0) => {
      setPreviewTheme(newSetting_0);
      if (newSetting_0 === "auto") {
        setSystemTheme(getSystemThemeName());
      }
    },
    savePreview: () => {
      if (previewTheme !== null) {
        setThemeSetting(previewTheme);
        setPreviewTheme(null);
        onThemeSave?.(previewTheme);
      }
    },
    cancelPreview: () => {
      if (previewTheme !== null) {
        setPreviewTheme(null);
      }
    },
    currentTheme
  }), [themeSetting, previewTheme, currentTheme, onThemeSave]);
  return /* @__PURE__ */ jsx(ThemeContext.Provider, { value, children });
}
function useTheme() {
  const $ = _c(3);
  const {
    currentTheme,
    setThemeSetting
  } = useContext(ThemeContext);
  let t0;
  if ($[0] !== currentTheme || $[1] !== setThemeSetting) {
    t0 = [currentTheme, setThemeSetting];
    $[0] = currentTheme;
    $[1] = setThemeSetting;
    $[2] = t0;
  } else {
    t0 = $[2];
  }
  return t0;
}
function useThemeSetting() {
  return useContext(ThemeContext).themeSetting;
}
function usePreviewTheme() {
  const $ = _c(4);
  const {
    setPreviewTheme,
    savePreview,
    cancelPreview
  } = useContext(ThemeContext);
  let t0;
  if ($[0] !== cancelPreview || $[1] !== savePreview || $[2] !== setPreviewTheme) {
    t0 = {
      setPreviewTheme,
      savePreview,
      cancelPreview
    };
    $[0] = cancelPreview;
    $[1] = savePreview;
    $[2] = setPreviewTheme;
    $[3] = t0;
  } else {
    t0 = $[3];
  }
  return t0;
}
export {
  ThemeProvider,
  usePreviewTheme,
  useTheme,
  useThemeSetting
};
