import { FlashList } from "@shopify/flash-list";
import { SlideInDown, SlideOutDown } from "react-native-reanimated";

import type { ReaderTocItem } from "@/src/components/reader/types";
import { READER_CHROME } from "@/src/design/reader-tokens";
import { Animated, Pressable, Text, View } from "@/tw";

import { chromeTocRowContainerStyle, chromeTocRowLabelStyle } from "./readerChromePalette";

export type ReaderTocSheetProps = {
  insetsBottom: number;
  toc: ReaderTocItem[];
  currentPage: number | null;
  activeColor: string;
  onSelectPage: (pageIndex: number) => void;
};

/** Estimated row height for FlashList recycling. */
const TOC_ITEM_ESTIMATED_HEIGHT = 48;

function TocItemRow({
  item,
  isActive,
  activeColor,
  onSelectPage,
}: {
  item: ReaderTocItem;
  isActive: boolean;
  activeColor: string;
  onSelectPage: (pageIndex: number) => void;
}) {
  return (
    <Pressable
      className="mb-2 rounded-2xl px-4 py-3"
      style={chromeTocRowContainerStyle(isActive)}
      onPress={() => onSelectPage(item.pageIndex)}
    >
      <Text
        className="text-sm"
        style={chromeTocRowLabelStyle(isActive, activeColor)}
        numberOfLines={2}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

/**
 * 底部弹出的章节目录列表。
 */
export function ReaderTocSheet({
  insetsBottom,
  toc,
  currentPage,
  activeColor,
  onSelectPage,
}: ReaderTocSheetProps) {
  return (
    <Animated.View
      entering={SlideInDown.duration(280)}
      exiting={SlideOutDown.duration(220)}
      className="absolute bottom-0 left-0 right-0 z-40 max-h-[55%] rounded-t-[26px]"
      style={{
        backgroundColor: READER_CHROME.surface,
        borderTopWidth: 1,
        borderTopColor: READER_CHROME.border,
        paddingBottom: Math.max(insetsBottom, 16),
        elevation: 18,
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: -8 },
      }}
    >
      <View
        className="mb-2 mt-3 h-[5px] w-11 self-center rounded-full"
        style={{ backgroundColor: READER_CHROME.surfaceIdle }}
      />
      <Text
        className="px-5 py-3 text-base font-bold"
        style={{ color: READER_CHROME.textIdle }}
      >
        目录
      </Text>
      <View className="flex-1 px-4">
        {toc.length > 0 ? (
          <FlashList
            data={toc}
            keyExtractor={(item) => item.id}
            estimatedItemSize={TOC_ITEM_ESTIMATED_HEIGHT}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
            renderItem={({ item }) => (
              <TocItemRow
                item={item}
                isActive={currentPage != null && item.pageIndex === currentPage}
                activeColor={activeColor}
                onSelectPage={onSelectPage}
              />
            )}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-sm text-white/40">此书籍没有目录</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}
