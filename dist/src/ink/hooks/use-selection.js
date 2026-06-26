import { useContext, useMemo, useSyncExternalStore } from "react";
import StdinContext from "../components/StdinContext.js";
import instances from "../instances.js";
import {
  shiftAnchor
} from "../selection.js";
function useSelection() {
  useContext(StdinContext);
  const ink = instances.get(process.stdout);
  return useMemo(() => {
    if (!ink) {
      return {
        copySelection: () => "",
        copySelectionNoClear: () => "",
        clearSelection: () => {
        },
        hasSelection: () => false,
        getState: () => null,
        subscribe: () => () => {
        },
        shiftAnchor: () => {
        },
        shiftSelection: () => {
        },
        moveFocus: () => {
        },
        captureScrolledRows: () => {
        },
        setSelectionBgColor: () => {
        }
      };
    }
    return {
      copySelection: () => ink.copySelection(),
      copySelectionNoClear: () => ink.copySelectionNoClear(),
      clearSelection: () => ink.clearTextSelection(),
      hasSelection: () => ink.hasTextSelection(),
      getState: () => ink.selection,
      subscribe: (cb) => ink.subscribeToSelectionChange(cb),
      shiftAnchor: (dRow, minRow, maxRow) => shiftAnchor(ink.selection, dRow, minRow, maxRow),
      shiftSelection: (dRow, minRow, maxRow) => ink.shiftSelectionForScroll(dRow, minRow, maxRow),
      moveFocus: (move) => ink.moveSelectionFocus(move),
      captureScrolledRows: (firstRow, lastRow, side) => ink.captureScrolledRows(firstRow, lastRow, side),
      setSelectionBgColor: (color) => ink.setSelectionBgColor(color)
    };
  }, [ink]);
}
const NO_SUBSCRIBE = () => () => {
};
const ALWAYS_FALSE = () => false;
function useHasSelection() {
  useContext(StdinContext);
  const ink = instances.get(process.stdout);
  return useSyncExternalStore(
    ink ? ink.subscribeToSelectionChange : NO_SUBSCRIBE,
    ink ? ink.hasTextSelection : ALWAYS_FALSE
  );
}
export {
  useHasSelection,
  useSelection
};
