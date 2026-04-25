import { useThemePalette } from "@/src/design/tokens";
import type { BookItem } from "@/src/data/types";
import { Image, Pressable, Text, View } from "@/tw";

import { ProgressBar } from "../ui/progress-bar";

export function BookCard({
  book,
  width,
  onPress,
}: {
  book: BookItem;
  width: number;
  onPress?: () => void;
}) {
  const palette = useThemePalette();

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      className="rounded-3xl p-3"
      onPress={onPress}
      style={{
        width,
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
      }}
    >
      {book.coverUri ? (
        <Image
          source={book.coverUri}
          className="aspect-[2/3] w-full rounded-[18px]"
        />
      ) : (
        <View
          className="aspect-[2/3] w-full items-center justify-center rounded-[18px] px-4"
          style={{ backgroundColor: palette.backgroundSecondary }}
        >
          <Text
            className="text-center text-sm leading-5"
            style={{ color: palette.textMuted, fontWeight: "600" }}
          >
            暂无封面
          </Text>
        </View>
      )}
      <Text selectable className="mt-3 text-[15px] font-semibold leading-5" style={{ color: palette.text }} numberOfLines={2}>
        {book.title}
      </Text>
      <Text selectable className="mt-1 text-sm leading-5" style={{ color: palette.textMuted }} numberOfLines={1}>
        {book.author}
      </Text>
      {typeof book.progress === "number" ? (
        <View className="mt-3">
          <ProgressBar progress={book.progress} />
        </View>
      ) : null}
    </Pressable>
  );
}
