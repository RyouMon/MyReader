import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolView } from "expo-symbols";
import { Platform } from "react-native";

import { useThemePalette } from "@/src/design/tokens";
import type { BookItem } from "@/src/data/types";
import { Pressable, Text, TouchableHighlight, View } from "@/tw";

import { CircularProgress } from "../ui/circular-progress";
import { ProgressBar } from "../ui/progress-bar";
import { BookCover, type BookDownloadStatus, type BookProgressSnapshot } from "./book-cover";

/**
 * Returns the mobile row status label for an optional progress snapshot.
 */
function getProgressLabel(progress?: BookProgressSnapshot) {
  if (progress?.statusLabel) {
    return progress.statusLabel;
  }
  if (typeof progress?.percent !== "number" || progress.percent <= 0) {
    return "未读";
  }
  if (progress.percent >= 100) {
    return "已读完";
  }
  return "阅读中";
}

/**
 * Renders the mobile list row for a book.
 */
export function BookRow({
  book,
  onPress,
  onMore,
  progress,
  downloadStatus,
  downloadProgress,
  horizontalPadding = 16,
}: {
  book: BookItem;
  onPress?: () => void;
  onMore?: () => void;
  progress?: BookProgressSnapshot;
  downloadStatus?: BookDownloadStatus;
  downloadProgress?: number;
  horizontalPadding?: number;
}) {
  const palette = useThemePalette();
  const hasProgress = typeof progress?.percent === "number";
  const progressValue = hasProgress ? Math.max(0, Math.min(100, progress.percent ?? 0)) / 100 : undefined;
  const isUnread = !hasProgress || (progress.percent ?? 0) <= 0;

  const showCloudIcon = downloadStatus === "notDownloaded";
  const showProgressIndicator = downloadStatus === "downloading";

  return (
    <TouchableHighlight
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`打开《${book.title}》`}
      onPress={onPress}
      underlayColor={palette.backgroundSecondary}
    >
      <View className="min-h-[60px] flex-row items-center gap-3.5 border-b py-2.5" style={{ borderColor: palette.border, paddingHorizontal: horizontalPadding }}>
        <BookCover
          book={book}
          width={38}
          height={54}
          borderRadius={5}
          showTitle={false}
        />
        <View className="min-w-0 flex-1">
          <Text selectable className="text-[15px] font-semibold leading-5" style={{ color: palette.text }} numberOfLines={1}>
            {book.title}
          </Text>
          <Text selectable className="mt-0.5 text-[13px] leading-5" style={{ color: palette.textMuted }} numberOfLines={1}>
            {book.author}
          </Text>
          <View className="mt-0.5 flex-row flex-wrap items-center gap-1.5">
            <Text
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{
                backgroundColor: isUnread ? palette.backgroundSecondary : "rgba(217,119,87,0.14)",
                color: isUnread ? palette.textMuted : palette.primary,
              }}
            >
              {getProgressLabel(progress)}
            </Text>
            {hasProgress ? (
              <Text className="text-xs" style={{ color: palette.textMuted }}>
                {Math.round(progress.percent ?? 0)}%
              </Text>
            ) : null}
            {progress?.syncedLabel ? (
              <Text className="text-xs" style={{ color: palette.textMuted }}>
                {progress.syncedLabel}
              </Text>
            ) : null}
            <View style={{ marginLeft: "auto" }}>
              {showCloudIcon ? (
                Platform.OS === "ios" ? (
                  <SymbolView name="cloud" size={13} tintColor={palette.textMuted} />
                ) : (
                  <MaterialIcons name="cloud-off" size={13} color={palette.textMuted} />
                )
              ) : showProgressIndicator ? (
                <CircularProgress progress={downloadProgress ?? 0} size={13} strokeWidth={1.5} color={palette.primary} />
              ) : null}
            </View>
          </View>
          {typeof progressValue === "number" ? (
            <View className="mt-1 w-14">
              <ProgressBar progress={progressValue} />
            </View>
          ) : null}
        </View>
        <View className="flex-row items-center gap-1">
          {onMore ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`更多操作：${book.title}`}
              className="h-11 w-11 items-center justify-center rounded-lg"
              onPress={(event) => {
                event.stopPropagation();
                onMore();
              }}
            >
              <MaterialIcons name="more-vert" size={22} color={palette.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </TouchableHighlight>
  );
}
