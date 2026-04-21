import { useThemePalette } from "@/src/design/tokens";
import { Text, TouchableOpacity } from "@/tw";

/** Renders the primary action button with theme-aware colors. */
export function PrimaryButton({
  title,
  onPress,
}: {
  title: string;
  onPress?: () => void;
}) {
  const palette = useThemePalette();

  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.85}
      className="min-h-12 flex-1 items-center justify-center rounded-full px-4"
      onPress={onPress}
      style={{ backgroundColor: palette.primary }}
    >
      <Text className="text-[15px]" style={{ color: palette.primaryForeground, fontWeight: "700" }}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}
