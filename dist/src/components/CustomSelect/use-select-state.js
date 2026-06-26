import { useCallback, useState } from "react";
import { useSelectNavigation } from "./use-select-navigation.js";
function useSelectState({
  visibleOptionCount = 5,
  options,
  defaultValue,
  onChange,
  onCancel,
  onFocus,
  focusValue
}) {
  const [value, setValue] = useState(defaultValue);
  const navigation = useSelectNavigation({
    visibleOptionCount,
    options,
    initialFocusValue: void 0,
    onFocus,
    focusValue
  });
  const selectFocusedOption = useCallback(() => {
    setValue(navigation.focusedValue);
  }, [navigation.focusedValue]);
  return {
    ...navigation,
    value,
    selectFocusedOption,
    onChange,
    onCancel
  };
}
export {
  useSelectState
};
