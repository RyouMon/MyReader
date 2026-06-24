import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette";
import { Text, View } from "@/tw";

export type ReaderChapterLabelProps = {
  insetsTop: number;
  title?: string | null;
  palette: ReaderChromePalette;
};

export function ReaderChapterLabel({
  insetsTop,
  title,
  palette,
}: ReaderChapterLabelProps) {
  return (
    <View
      className="absolute left-0 right-0 top-0 z-10 items-center justify-center"
      style={{ paddingTop: insetsTop + 10, minHeight: insetsTop + 38 }}
      pointerEvents="none"
    >
      <Text
        className="text-base font-medium"
        style={{ color: palette.textMuted }}
        numberOfLines={1}
      >
        {title ?? ""}
      </Text>
    </View>
  );
}
