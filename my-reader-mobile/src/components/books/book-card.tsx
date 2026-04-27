import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolView } from "expo-symbols";
import { Platform } from "react-native";

import type { BookItem } from "@/src/data/types";
import { useThemePalette } from "@/src/design/tokens";
import { Pressable, Text, TouchableHighlight, View } from "@/tw";

import { CircularProgress } from "../ui/circular-progress";
import { ProgressBar } from "../ui/progress-bar";
import { BookCover, type BookDownloadStatus, type BookProgressSnapshot } from "./book-cover";

/**
 * Renders the mobile cover-first book card.
 */
export function BookCard({
  book,
  width,
  onPress,
  onMore,
  progress,
  downloadStatus,
  downloadProgress,
}: {
  book: BookItem;
  width: number;
  onPress?: () => void;
  onMore?: () => void;
  progress?: BookProgressSnapshot;
  downloadStatus?: BookDownloadStatus;
  downloadProgress?: number;
}) {
  const palette = useThemePalette();
  const coverHeight = Math.round(width * 1.43);
  const progressValue = typeof progress?.percent === "number" ? Math.max(0, Math.min(100, progress.percent)) / 100 : undefined;

  const showCloudIcon = downloadStatus === "notDownloaded";
  const showProgressIndicator = downloadStatus === "downloading";

  return (
    <View
      style={{
        width,
      }}
    >
      <View className="relative">
        <TouchableHighlight
          accessibilityRole={onPress ? "button" : undefined}
          accessibilityLabel={`打开《${book.title}》`}
          onPress={onPress}
          activeOpacity={0.78}
          underlayColor={palette.backgroundSecondary}
          style={{ borderRadius: 10, overflow: "hidden" }}
        >
          <View>
            <BookCover
              book={book}
              width={width}
              height={coverHeight}
              borderRadius={10}
            />
          </View>
        </TouchableHighlight>
        {onMore ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`更多操作：${book.title}`}
            className="absolute right-2 top-2 h-8 w-8 items-center justify-center rounded-full"
            onPress={(event) => {
              event.stopPropagation();
              onMore();
            }}
            style={{ backgroundColor: "rgba(255,255,255,0.20)", borderColor: "rgba(255,255,255,0.28)", borderWidth: 1 }}
          >
            <MaterialIcons name="more-vert" size={18} color={palette.textOnPrimary} />
          </Pressable>
        ) : null}
      </View>
      <Text selectable className="mt-2 text-[15px] font-semibold leading-5" style={{ color: palette.text }} numberOfLines={2}>
        {book.title}
      </Text>
      <View className="mt-1 flex-row items-center">
        <Text selectable className="flex-1 text-sm leading-5" style={{ color: palette.textMuted }} numberOfLines={1}>
          {book.author}
        </Text>
        {showCloudIcon ? (
          Platform.OS === "ios" ? (
            <SymbolView name="cloud" size={14} tintColor={palette.textMuted} />
          ) : (
            <MaterialIcons name="cloud-off" size={14} color={palette.textMuted} />
          )
        ) : showProgressIndicator ? (
          <CircularProgress progress={downloadProgress ?? 0} size={14} strokeWidth={1.5} color={palette.primary} />
        ) : null}
      </View>
      {typeof progressValue === "number" ? (
        <View className="mt-2">
          <ProgressBar progress={progressValue} />
        </View>
      ) : null}
    </View>
  );
}
