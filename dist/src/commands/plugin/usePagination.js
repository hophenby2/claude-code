import { useCallback, useMemo, useRef } from "react";
const DEFAULT_MAX_VISIBLE = 5;
function usePagination({
  totalItems,
  maxVisible = DEFAULT_MAX_VISIBLE,
  selectedIndex = 0
}) {
  const needsPagination = totalItems > maxVisible;
  const scrollOffsetRef = useRef(0);
  const scrollOffset = useMemo(() => {
    if (!needsPagination) return 0;
    const prevOffset = scrollOffsetRef.current;
    if (selectedIndex < prevOffset) {
      scrollOffsetRef.current = selectedIndex;
      return selectedIndex;
    }
    if (selectedIndex >= prevOffset + maxVisible) {
      const newOffset = selectedIndex - maxVisible + 1;
      scrollOffsetRef.current = newOffset;
      return newOffset;
    }
    const maxOffset = Math.max(0, totalItems - maxVisible);
    const clampedOffset = Math.min(prevOffset, maxOffset);
    scrollOffsetRef.current = clampedOffset;
    return clampedOffset;
  }, [selectedIndex, maxVisible, needsPagination, totalItems]);
  const startIndex = scrollOffset;
  const endIndex = Math.min(scrollOffset + maxVisible, totalItems);
  const getVisibleItems = useCallback(
    (items) => {
      if (!needsPagination) return items;
      return items.slice(startIndex, endIndex);
    },
    [needsPagination, startIndex, endIndex]
  );
  const toActualIndex = useCallback(
    (visibleIndex) => {
      return startIndex + visibleIndex;
    },
    [startIndex]
  );
  const isOnCurrentPage = useCallback(
    (actualIndex) => {
      return actualIndex >= startIndex && actualIndex < endIndex;
    },
    [startIndex, endIndex]
  );
  const goToPage = useCallback((_page) => {
  }, []);
  const nextPage = useCallback(() => {
  }, []);
  const prevPage = useCallback(() => {
  }, []);
  const handleSelectionChange = useCallback(
    (newIndex, setSelectedIndex) => {
      const clampedIndex = Math.max(0, Math.min(newIndex, totalItems - 1));
      setSelectedIndex(clampedIndex);
    },
    [totalItems]
  );
  const handlePageNavigation = useCallback(
    (_direction, _setSelectedIndex) => {
      return false;
    },
    []
  );
  const totalPages = Math.max(1, Math.ceil(totalItems / maxVisible));
  const currentPage = Math.floor(scrollOffset / maxVisible);
  return {
    currentPage,
    totalPages,
    startIndex,
    endIndex,
    needsPagination,
    pageSize: maxVisible,
    getVisibleItems,
    toActualIndex,
    isOnCurrentPage,
    goToPage,
    nextPage,
    prevPage,
    handleSelectionChange,
    handlePageNavigation,
    scrollPosition: {
      current: selectedIndex + 1,
      total: totalItems,
      canScrollUp: scrollOffset > 0,
      canScrollDown: scrollOffset + maxVisible < totalItems
    }
  };
}
export {
  usePagination
};
