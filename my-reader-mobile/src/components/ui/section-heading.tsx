import { useThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

export function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  const palette = useThemePalette();

  return (
    <View className="gap-1 px-1">
      <Text
        selectable
        className="text-[28px] leading-[34px]"
        style={{ color: palette.text, fontWeight: "700", letterSpacing: -0.2 }}
      >
        {title}
      </Text>
      {detail ? (
        <Text selectable className="text-sm leading-5" style={{ color: palette.textMuted }}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
