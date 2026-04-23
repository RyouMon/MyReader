import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { FadeIn, FadeOut } from "react-native-reanimated";

import { READER_CHROME, chromeBookmarkIconColor } from "@/src/design/reader-tokens";
import { Animated, Pressable, Text, View } from "@/tw";

export type ReaderTopBarProps = {
  insetsTop: number;
  title: string;
  chapterTitle?: string | null;
  bookmarkActive: boolean;
  onBack: () => void;
  onToggleBookmark: () => void;
};

/**
 * 阅读器顶部栏：返回、书名章节、书签。
 */
export function ReaderTopBar({
  insetsTop,
  title,
  chapterTitle,
  bookmarkActive,
  onBack,
  onToggleBookmark,
}: ReaderTopBarProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      className="absolute left-0 right-0 top-0 z-20"
      style={{ paddingTop: insetsTop + 10 }}
      pointerEvents="box-none"
    >
      <View
        className="mx-0 min-h-[52px] flex-row items-center gap-2 px-2.5 pb-1 pt-1.5"
        style={{ backgroundColor: READER_CHROME.surface }}
        pointerEvents="auto"
      >
        <Pressable
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: READER_CHROME.surfaceIdle }}
          onPress={onBack}
        >
          <MaterialIcons
            name="arrow-back-ios-new"
            size={18}
            color={READER_CHROME.textIdle}
          />
        </Pressable>
        <View className="flex-1 items-center justify-center px-2">
          <Text
            className="text-sm font-semibold"
            style={{ color: READER_CHROME.textIdle }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {chapterTitle ? (
            <Text
              className="mt-0.5 text-xs"
              style={{ color: READER_CHROME.textMuted }}
              numberOfLines={1}
            >
              {chapterTitle}
            </Text>
          ) : null}
        </View>
        <Pressable
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{
            backgroundColor: bookmarkActive
              ? READER_CHROME.surfaceActive
              : READER_CHROME.surfaceIdle,
          }}
          onPress={onToggleBookmark}
        >
          <MaterialIcons
            name={bookmarkActive ? "bookmark" : "bookmark-border"}
            size={20}
            color={chromeBookmarkIconColor(bookmarkActive)}
          />
        </Pressable>
      </View>
    </Animated.View>
  );
}
