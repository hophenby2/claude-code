import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from "react";
import { isDeepStrictEqual } from "util";
import OptionMap from "./option-map.js";
const reducer = (state, action) => {
  switch (action.type) {
    case "focus-next-option": {
      if (state.focusedValue === void 0) {
        return state;
      }
      const item = state.optionMap.get(state.focusedValue);
      if (!item) {
        return state;
      }
      const next = item.next || state.optionMap.first;
      if (!next) {
        return state;
      }
      if (!item.next && next === state.optionMap.first) {
        return {
          ...state,
          focusedValue: next.value,
          visibleFromIndex: 0,
          visibleToIndex: state.visibleOptionCount
        };
      }
      const needsToScroll = next.index >= state.visibleToIndex;
      if (!needsToScroll) {
        return {
          ...state,
          focusedValue: next.value
        };
      }
      const nextVisibleToIndex = Math.min(
        state.optionMap.size,
        state.visibleToIndex + 1
      );
      const nextVisibleFromIndex = nextVisibleToIndex - state.visibleOptionCount;
      return {
        ...state,
        focusedValue: next.value,
        visibleFromIndex: nextVisibleFromIndex,
        visibleToIndex: nextVisibleToIndex
      };
    }
    case "focus-previous-option": {
      if (state.focusedValue === void 0) {
        return state;
      }
      const item = state.optionMap.get(state.focusedValue);
      if (!item) {
        return state;
      }
      const previous = item.previous || state.optionMap.last;
      if (!previous) {
        return state;
      }
      if (!item.previous && previous === state.optionMap.last) {
        const nextVisibleToIndex2 = state.optionMap.size;
        const nextVisibleFromIndex2 = Math.max(
          0,
          nextVisibleToIndex2 - state.visibleOptionCount
        );
        return {
          ...state,
          focusedValue: previous.value,
          visibleFromIndex: nextVisibleFromIndex2,
          visibleToIndex: nextVisibleToIndex2
        };
      }
      const needsToScroll = previous.index <= state.visibleFromIndex;
      if (!needsToScroll) {
        return {
          ...state,
          focusedValue: previous.value
        };
      }
      const nextVisibleFromIndex = Math.max(0, state.visibleFromIndex - 1);
      const nextVisibleToIndex = nextVisibleFromIndex + state.visibleOptionCount;
      return {
        ...state,
        focusedValue: previous.value,
        visibleFromIndex: nextVisibleFromIndex,
        visibleToIndex: nextVisibleToIndex
      };
    }
    case "focus-next-page": {
      if (state.focusedValue === void 0) {
        return state;
      }
      const item = state.optionMap.get(state.focusedValue);
      if (!item) {
        return state;
      }
      const targetIndex = Math.min(
        state.optionMap.size - 1,
        item.index + state.visibleOptionCount
      );
      let targetItem = state.optionMap.first;
      while (targetItem && targetItem.index < targetIndex) {
        if (targetItem.next) {
          targetItem = targetItem.next;
        } else {
          break;
        }
      }
      if (!targetItem) {
        return state;
      }
      const nextVisibleToIndex = Math.min(
        state.optionMap.size,
        targetItem.index + 1
      );
      const nextVisibleFromIndex = Math.max(
        0,
        nextVisibleToIndex - state.visibleOptionCount
      );
      return {
        ...state,
        focusedValue: targetItem.value,
        visibleFromIndex: nextVisibleFromIndex,
        visibleToIndex: nextVisibleToIndex
      };
    }
    case "focus-previous-page": {
      if (state.focusedValue === void 0) {
        return state;
      }
      const item = state.optionMap.get(state.focusedValue);
      if (!item) {
        return state;
      }
      const targetIndex = Math.max(0, item.index - state.visibleOptionCount);
      let targetItem = state.optionMap.first;
      while (targetItem && targetItem.index < targetIndex) {
        if (targetItem.next) {
          targetItem = targetItem.next;
        } else {
          break;
        }
      }
      if (!targetItem) {
        return state;
      }
      const nextVisibleFromIndex = Math.max(0, targetItem.index);
      const nextVisibleToIndex = Math.min(
        state.optionMap.size,
        nextVisibleFromIndex + state.visibleOptionCount
      );
      return {
        ...state,
        focusedValue: targetItem.value,
        visibleFromIndex: nextVisibleFromIndex,
        visibleToIndex: nextVisibleToIndex
      };
    }
    case "reset": {
      return action.state;
    }
    case "set-focus": {
      if (state.focusedValue === action.value) {
        return state;
      }
      const item = state.optionMap.get(action.value);
      if (!item) {
        return state;
      }
      if (item.index >= state.visibleFromIndex && item.index < state.visibleToIndex) {
        return {
          ...state,
          focusedValue: action.value
        };
      }
      let nextVisibleFromIndex;
      let nextVisibleToIndex;
      if (item.index < state.visibleFromIndex) {
        nextVisibleFromIndex = item.index;
        nextVisibleToIndex = Math.min(
          state.optionMap.size,
          nextVisibleFromIndex + state.visibleOptionCount
        );
      } else {
        nextVisibleToIndex = Math.min(state.optionMap.size, item.index + 1);
        nextVisibleFromIndex = Math.max(
          0,
          nextVisibleToIndex - state.visibleOptionCount
        );
      }
      return {
        ...state,
        focusedValue: action.value,
        visibleFromIndex: nextVisibleFromIndex,
        visibleToIndex: nextVisibleToIndex
      };
    }
  }
};
const createDefaultState = ({
  visibleOptionCount: customVisibleOptionCount,
  options,
  initialFocusValue,
  currentViewport
}) => {
  const visibleOptionCount = typeof customVisibleOptionCount === "number" ? Math.min(customVisibleOptionCount, options.length) : options.length;
  const optionMap = new OptionMap(options);
  const focusedItem = initialFocusValue !== void 0 && optionMap.get(initialFocusValue);
  const focusedValue = focusedItem ? initialFocusValue : optionMap.first?.value;
  let visibleFromIndex = 0;
  let visibleToIndex = visibleOptionCount;
  if (focusedItem) {
    const focusedIndex = focusedItem.index;
    if (currentViewport) {
      if (focusedIndex >= currentViewport.visibleFromIndex && focusedIndex < currentViewport.visibleToIndex) {
        visibleFromIndex = currentViewport.visibleFromIndex;
        visibleToIndex = Math.min(
          optionMap.size,
          currentViewport.visibleToIndex
        );
      } else {
        if (focusedIndex < currentViewport.visibleFromIndex) {
          visibleFromIndex = focusedIndex;
          visibleToIndex = Math.min(
            optionMap.size,
            visibleFromIndex + visibleOptionCount
          );
        } else {
          visibleToIndex = Math.min(optionMap.size, focusedIndex + 1);
          visibleFromIndex = Math.max(0, visibleToIndex - visibleOptionCount);
        }
      }
    } else if (focusedIndex >= visibleOptionCount) {
      visibleToIndex = Math.min(optionMap.size, focusedIndex + 1);
      visibleFromIndex = Math.max(0, visibleToIndex - visibleOptionCount);
    }
    visibleFromIndex = Math.max(
      0,
      Math.min(visibleFromIndex, optionMap.size - 1)
    );
    visibleToIndex = Math.min(
      optionMap.size,
      Math.max(visibleOptionCount, visibleToIndex)
    );
  }
  return {
    optionMap,
    visibleOptionCount,
    focusedValue,
    visibleFromIndex,
    visibleToIndex
  };
};
function useSelectNavigation({
  visibleOptionCount = 5,
  options,
  initialFocusValue,
  onFocus,
  focusValue
}) {
  const [state, dispatch] = useReducer(
    reducer,
    {
      visibleOptionCount,
      options,
      initialFocusValue: focusValue || initialFocusValue
    },
    createDefaultState
  );
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const [lastOptions, setLastOptions] = useState(options);
  if (options !== lastOptions && !isDeepStrictEqual(options, lastOptions)) {
    dispatch({
      type: "reset",
      state: createDefaultState({
        visibleOptionCount,
        options,
        initialFocusValue: focusValue ?? state.focusedValue ?? initialFocusValue,
        currentViewport: {
          visibleFromIndex: state.visibleFromIndex,
          visibleToIndex: state.visibleToIndex
        }
      })
    });
    setLastOptions(options);
  }
  const focusNextOption = useCallback(() => {
    dispatch({
      type: "focus-next-option"
    });
  }, []);
  const focusPreviousOption = useCallback(() => {
    dispatch({
      type: "focus-previous-option"
    });
  }, []);
  const focusNextPage = useCallback(() => {
    dispatch({
      type: "focus-next-page"
    });
  }, []);
  const focusPreviousPage = useCallback(() => {
    dispatch({
      type: "focus-previous-page"
    });
  }, []);
  const focusOption = useCallback((value) => {
    if (value !== void 0) {
      dispatch({
        type: "set-focus",
        value
      });
    }
  }, []);
  const visibleOptions = useMemo(() => {
    return options.map((option, index) => ({
      ...option,
      index
    })).slice(state.visibleFromIndex, state.visibleToIndex);
  }, [options, state.visibleFromIndex, state.visibleToIndex]);
  const validatedFocusedValue = useMemo(() => {
    if (state.focusedValue === void 0) {
      return void 0;
    }
    const exists = options.some((opt) => opt.value === state.focusedValue);
    if (exists) {
      return state.focusedValue;
    }
    return options[0]?.value;
  }, [state.focusedValue, options]);
  const isInInput = useMemo(() => {
    const focusedOption = options.find(
      (opt) => opt.value === validatedFocusedValue
    );
    return focusedOption?.type === "input";
  }, [validatedFocusedValue, options]);
  useEffect(() => {
    if (validatedFocusedValue !== void 0) {
      onFocusRef.current?.(validatedFocusedValue);
    }
  }, [validatedFocusedValue]);
  useEffect(() => {
    if (focusValue !== void 0) {
      dispatch({
        type: "set-focus",
        value: focusValue
      });
    }
  }, [focusValue]);
  const focusedIndex = useMemo(() => {
    if (validatedFocusedValue === void 0) {
      return 0;
    }
    const index = options.findIndex((opt) => opt.value === validatedFocusedValue);
    return index >= 0 ? index + 1 : 0;
  }, [validatedFocusedValue, options]);
  return {
    focusedValue: validatedFocusedValue,
    focusedIndex,
    visibleFromIndex: state.visibleFromIndex,
    visibleToIndex: state.visibleToIndex,
    visibleOptions,
    isInInput: isInInput ?? false,
    focusNextOption,
    focusPreviousOption,
    focusNextPage,
    focusPreviousPage,
    focusOption,
    options
  };
}
export {
  useSelectNavigation
};
