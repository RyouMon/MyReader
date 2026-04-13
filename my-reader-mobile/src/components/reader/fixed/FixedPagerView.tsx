import { forwardRef, useCallback, useRef } from "react";
import {
  FlatList,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewProps,
  View,
} from "react-native";

type PagerTouchProps = Pick<ViewProps, "onTouchStart" | "onTouchEnd" | "onTouchCancel">;

export type FixedPagerViewProps = {
  width: number;
  height: number;
  totalPages: number;
  initialIndex: number;
  pageIndex: number;
  onPageIndexChange: (index: number) => void;
  renderPage: (index: number) => React.ReactElement;
} & PagerTouchProps;

export const FixedPagerView = forwardRef<FlatList<number>, FixedPagerViewProps>(
  function FixedPagerView(
    {
      width,
      height,
      totalPages,
      initialIndex,
      pageIndex,
      onPageIndexChange,
      renderPage,
      onTouchStart,
      onTouchEnd,
      onTouchCancel,
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
        const x = e.nativeEvent.contentOffset.x;
        const idx = Math.round(x / Math.max(width, 1));
        if (idx >= 0 && idx < totalPages && idx !== pageIndex) {
          onPageIndexChange(idx);
        }
      },
      [width, totalPages, pageIndex, onPageIndexChange],
    );

    const renderItem: ListRenderItem<number> = useCallback(
      ({ item }) => <View style={{ width, height }}>{renderPage(item)}</View>,
      [width, height, renderPage],
    );

    const keyExtractor = useCallback((i: number) => `page-${i}`, []);

    const getItemLayout = useCallback(
      (_: unknown, index: number) => ({
        length: width,
        offset: width * index,
        index,
      }),
      [width],
    );

    const onScrollToIndexFailed = useCallback(
      (info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
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
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
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
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        style={{ width, height }}
      />
    );
  },
);
