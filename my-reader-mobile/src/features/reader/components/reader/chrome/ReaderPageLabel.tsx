import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette";
import { Text, View } from "@/tw";

export type ReaderPageLabelProps = {
  insetsBottom: number;
  label: string;
  palette: ReaderChromePalette;
};

export function ReaderPageLabel({
  insetsBottom,
  label,
  palette,
}: ReaderPageLabelProps) {
  return (
    <View
      className="absolute bottom-0 left-0 right-0 z-10 items-center justify-center"
      style={{ paddingBottom: Math.max(insetsBottom, 12), minHeight: insetsBottom + 28 }}
      pointerEvents="none"
    >
      <Text
        className="text-xs"
        style={{ color: palette.textFaint }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}
