import { forwardRef, useCallback, useRef } from "react";
import {
  FlatList,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View,
} from "react-native";

export type FixedScrollViewProps = {
  width: number;
  height: number;
  totalPages: number;
  initialIndex: number;
  pageIndex: number;
  onPageIndexChange: (index: number) => void;
  renderPage: (index: number) => React.ReactElement;
};

/**
 * Vertical paged scrolling (one page per viewport height).
 * Prefer {@link FixedPagerView} for typical LTR horizontal comic reading.
 */
export const FixedScrollView = forwardRef<FlatList<number>, FixedScrollViewProps>(
  function FixedScrollView(
    {
      width,
      height,
      totalPages,
      initialIndex,
      pageIndex,
      onPageIndexChange,
      renderPage,
    },
    ref,
  ) {
    const innerRef = useRef<FlatList<number>>(null);
    const setRefs = useCallback(
      (node: FlatList<number> | null) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<FlatList<number> | null>).current = node;
      },
      [ref],
    );

    const data = totalPages > 0 ? Array.from({ length: totalPages }, (_, i) => i) : [];

    const onScrollEnd = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const y = e.nativeEvent.contentOffset.y;
        const idx = Math.round(y / Math.max(height, 1));
        if (idx >= 0 && idx < totalPages && idx !== pageIndex) {
          onPageIndexChange(idx);
        }
      },
      [height, totalPages, pageIndex, onPageIndexChange],
    );

    const renderItem: ListRenderItem<number> = useCallback(
      ({ item }) => <View style={{ width, height }}>{renderPage(item)}</View>,
      [width, height, renderPage],
    );

    const keyExtractor = useCallback((i: number) => `scroll-page-${i}`, []);

    const getItemLayout = useCallback(
      (_: unknown, index: number) => ({
        length: height,
        offset: height * index,
        index,
      }),
      [height],
    );

    const onScrollToIndexFailed = useCallback(
      (info: { index: number }) => {
        setTimeout(() => {
          innerRef.current?.scrollToIndex({ index: info.index, animated: true });
        }, 120);
      },
      [],
    );

    return (
      <FlatList
        ref={setRefs}
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        initialScrollIndex={
          totalPages > 0 ? Math.min(initialIndex, Math.max(0, totalPages - 1)) : 0
        }
        getItemLayout={getItemLayout}
        windowSize={5}
        maxToRenderPerBatch={3}
        initialNumToRender={1}
        removeClippedSubviews={false}
        onMomentumScrollEnd={onScrollEnd}
        onScrollToIndexFailed={onScrollToIndexFailed}
        style={{ width, height }}
      />
    );
  },
);
