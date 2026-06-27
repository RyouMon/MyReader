import { useEffect } from "react";
import { View } from "react-native";
import Reanimated, {
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  useAnimatedStyle,
} from "react-native-reanimated";

import { useThemePalette } from "@/src/design/tokens";
import type { LibraryViewMode } from "@/src/store/app-store.types";

function usePulse() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 750 }),
        withTiming(1.0, { duration: 750 }),
      ),
      -1,
      false,
    );
  }, [opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

function CardSkeleton({
  width,
  palette,
}: {
  width: number;
  palette: ReturnType<typeof useThemePalette>;
}) {
  // Matches BookCard: cover aspect 1.43, mt-2 title, mt-1 author
  const coverHeight = Math.round(width * 1.43);
  return (
    <View style={{ width }}>
      <View
        style={{
          width,
          height: coverHeight,
          borderRadius: 10,
          backgroundColor: palette.surface,
        }}
      />
      <View
        style={{
          marginTop: 8,
          height: 14,
          borderRadius: 4,
          backgroundColor: palette.surface,
          width: "78%",
        }}
      />
      <View
        style={{
          marginTop: 4,
          height: 12,
          borderRadius: 4,
          backgroundColor: palette.surface,
          width: "52%",
        }}
      />
    </View>
  );
}

function RowSkeleton({
  palette,
  horizontalPadding,
}: {
  palette: ReturnType<typeof useThemePalette>;
  horizontalPadding: number;
}) {
  // Matches BookRow: minHeight 60, py-2.5, gap-3.5, cover 38×54, border-b
  return (
    <View
      style={{
        minHeight: 60,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingHorizontal: horizontalPadding,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: palette.border,
      }}
    >
      <View
        style={{
          width: 38,
          height: 54,
          borderRadius: 5,
          backgroundColor: palette.surface,
        }}
      />
      <View style={{ flex: 1 }}>
        <View
          style={{
            height: 15,
            borderRadius: 4,
            backgroundColor: palette.surface,
            width: "68%",
          }}
        />
        <View
          style={{
            marginTop: 6,
            height: 13,
            borderRadius: 4,
            backgroundColor: palette.surface,
            width: "44%",
          }}
        />
      </View>
    </View>
  );
}

/**
 * Renders an animated skeleton grid/list that mirrors the real BookCard/BookRow layout.
 *
 * Grid: This component is placed as ListEmptyComponent inside FlashList, which already
 * applies contentContainerStyle paddingHorizontal = GRID_PADDING_X - GRID_CARD_GAP / 2.
 * Rows therefore carry no extra horizontal padding; only each card slot adds GRID_CARD_GAP / 2
 * on each side — identical to the real renderItem wrapper.
 *
 * List: contentContainerStyle paddingHorizontal = 0, so each row applies LIST_PADDING_X
 * directly, matching BookRow's own paddingHorizontal.
 */
export function LibrarySkeletonContent({
  viewMode,
  cardWidth,
  gridColumns,
  gridGap,
  listPaddingX,
  count = 16,
}: {
  viewMode: LibraryViewMode;
  cardWidth: number;
  gridColumns: number;
  gridGap: number;
  listPaddingX: number;
  count?: number;
}) {
  const palette = useThemePalette();
  const animatedStyle = usePulse();
  const halfGap = gridGap / 2;

  if (viewMode === "list") {
    return (
      <Reanimated.View style={animatedStyle}>
        {Array.from({ length: count }, (_, i) => (
          <RowSkeleton key={i} palette={palette} horizontalPadding={listPaddingX} />
        ))}
      </Reanimated.View>
    );
  }

  const rowCount = Math.ceil(count / gridColumns);
  return (
    // gap replaces ItemSeparatorComponent (height: GRID_GAP) between rows
    <Reanimated.View style={[animatedStyle, { gap: gridGap }]}>
      {Array.from({ length: rowCount }, (_, row) => (
        <View key={row} style={{ flexDirection: "row" }}>
          {Array.from({ length: gridColumns }, (_, col) => (
            // paddingHorizontal mirrors the real renderItem wrapper: paddingHorizontal: GRID_HALF_GAP
            <View key={col} style={{ paddingHorizontal: halfGap }}>
              <CardSkeleton width={cardWidth} palette={palette} />
            </View>
          ))}
        </View>
      ))}
    </Reanimated.View>
  );
}
