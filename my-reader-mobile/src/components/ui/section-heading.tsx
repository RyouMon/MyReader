import { useThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

export function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  const palette = useThemePalette();

  return (
    <View className="gap-1 px-1">
      <Text
        className="text-3xl"
        style={{ color: palette.text, fontWeight: "700", letterSpacing: -0.2 }}
      >
        {title}
      </Text>
      {detail ? (
        <Text className="text-sm" style={{ color: palette.textMuted }}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
