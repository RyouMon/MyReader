import { useThemePalette } from "@/src/design/tokens";
import type { BookItem } from "@/src/data/types";
import { Image, Text, View } from "@/tw";

export type BookProgressSnapshot = {
  percent?: number;
  statusLabel?: string;
  syncedLabel?: string;
};

/**
 * Returns a stable fallback color for books without cover art.
 */
export function getFallbackCoverColor(title: string) {
  let hash = 0;
  for (let index = 0; index < title.length; index += 1) {
    hash = ((hash << 5) - hash + title.charCodeAt(index)) | 0;
  }
  const colors = ["#4A3728", "#1A3A4A", "#5C4200", "#1E3A2A", "#4A2838", "#2D2F4A"];
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Renders a compact mobile book cover with fallback title art.
 */
export function BookCover({
  book,
  width,
  height,
  borderRadius = 10,
  showTitle = true,
}: {
  book: BookItem;
  width: number;
  height: number;
  borderRadius?: number;
  showTitle?: boolean;
}) {
  const palette = useThemePalette();

  return (
    <View
      className="overflow-hidden"
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: getFallbackCoverColor(book.title),
        shadowColor: palette.text,
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: { width: 1, height: 3 },
        elevation: 3,
      }}
    >
      {book.coverUri ? (
        <Image source={book.coverUri} className="h-full w-full" />
      ) : (
        <View className="h-full w-full justify-end px-2 py-3">
          {showTitle ? (
            <Text className="text-center text-[10px] font-semibold leading-4" style={{ color: palette.textOnPrimary }} numberOfLines={3}>
              {book.title}
            </Text>
          ) : null}
        </View>
      )}
      <View className="absolute bottom-0 left-0 top-0 w-1.5" style={{ backgroundColor: "rgba(0,0,0,0.22)" }} />
    </View>
  );
}
