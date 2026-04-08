import { useThemePalette } from "@/src/design/tokens";
import { Pressable, Text } from "@/tw";

export function PrimaryButton({
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
      style={{ backgroundColor: palette.primary }}
    >
      <Text className="text-[15px]" style={{ color: palette.primaryForeground, fontWeight: "700" }}>
        {title}
      </Text>
    </Pressable>
  );
}
