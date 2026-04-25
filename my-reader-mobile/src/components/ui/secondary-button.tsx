import { useThemePalette } from "@/src/design/tokens";
import { Pressable, Text } from "@/tw";

export function SecondaryButton({
  title,
  onPress,
}: {
  title: string;
  onPress?: () => void;
}) {
  const palette = useThemePalette();

  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-12 flex-1 items-center justify-center rounded-full px-4"
      onPress={onPress}
      style={{
        backgroundColor: palette.backgroundSecondary,
        borderColor: palette.border,
        borderWidth: 1,
      }}
    >
      <Text className="text-[15px]" style={{ color: palette.text, fontWeight: "700" }}>
        {title}
      </Text>
    </Pressable>
  );
}
