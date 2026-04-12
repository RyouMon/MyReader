import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { FadeIn, FadeOut } from "react-native-reanimated";

import { Animated, Pressable, Text, View } from "@/tw";

import { chromeTopBarBookmarkIconColor } from "./readerChromePalette";

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
        className="mx-0 min-h-[52px] flex-row items-center gap-2 bg-[#110D0A] px-2.5 pb-1 pt-1.5"
        pointerEvents="auto"
      >
        <Pressable
          className="h-11 w-11 items-center justify-center rounded-full bg-[rgba(17,13,10,0.42)]"
          onPress={onBack}
        >
          <MaterialIcons name="arrow-back-ios-new" size={18} color="#F4EEE6" />
        </Pressable>
        <View className="flex-1 items-center justify-center px-2">
          <Text className="text-sm font-semibold text-[#F4EEE6]" numberOfLines={1}>
            {title}
          </Text>
          {chapterTitle ? (
            <Text className="mt-0.5 text-xs text-[rgba(244,238,230,0.56)]" numberOfLines={1}>
              {chapterTitle}
            </Text>
          ) : null}
        </View>
        <Pressable
          className={`h-11 w-11 items-center justify-center rounded-full ${
            bookmarkActive ? "bg-[rgba(201,135,78,0.14)]" : "bg-[rgba(17,13,10,0.42)]"
          }`}
          onPress={onToggleBookmark}
        >
          <MaterialIcons
            name={bookmarkActive ? "bookmark" : "bookmark-border"}
            size={20}
            color={chromeTopBarBookmarkIconColor(bookmarkActive)}
          />
        </Pressable>
      </View>
    </Animated.View>
  );
}
