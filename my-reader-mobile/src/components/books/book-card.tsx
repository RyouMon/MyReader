import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { useThemePalette } from "@/src/design/tokens";
import type { BookItem } from "@/src/data/types";
import { Pressable, Text, View } from "@/tw";

import { ProgressBar } from "../ui/progress-bar";
import { BookCover, type BookProgressSnapshot } from "./book-cover";

/**
 * Renders the mobile cover-first book card.
 */
export function BookCard({
  book,
  width,
  onPress,
  onMore,
  progress,
}: {
  book: BookItem;
  width: number;
  onPress?: () => void;
  onMore?: () => void;
  progress?: BookProgressSnapshot;
}) {
  const palette = useThemePalette();
  const coverHeight = Math.round(width * 1.43);
  const progressValue = typeof progress?.percent === "number" ? Math.max(0, Math.min(100, progress.percent)) / 100 : undefined;

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`打开《${book.title}》`}
      className="relative"
      onPress={onPress}
      style={{
        width,
      }}
    >
      <BookCover book={book} width={width} height={coverHeight} borderRadius={10} />
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
      <Text selectable className="mt-2 text-[15px] font-semibold leading-5" style={{ color: palette.text }} numberOfLines={2}>
        {book.title}
      </Text>
      <Text selectable className="mt-1 text-sm leading-5" style={{ color: palette.textMuted }} numberOfLines={1}>
        {book.author}
      </Text>
      {typeof progressValue === "number" ? (
        <View className="mt-2">
          <ProgressBar progress={progressValue} />
        </View>
      ) : null}
    </Pressable>
  );
}
