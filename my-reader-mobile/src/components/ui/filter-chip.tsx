import { useThemePalette } from "@/src/design/tokens";
import { Pressable, Text } from "@/tw";

export function FilterChip({
  active,
  label,
}: {
  active?: boolean;
  label: string;
}) {
  const palette = useThemePalette();

  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-11 rounded-full px-4 items-center justify-center"
      style={{
        backgroundColor: active ? palette.primary : palette.surface,
        borderColor: active ? palette.primary : palette.border,
        borderWidth: 1,
      }}
    >
      <Text
        className="text-[15px]"
        style={{ color: active ? palette.primaryForeground : palette.text, fontWeight: "700" }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
