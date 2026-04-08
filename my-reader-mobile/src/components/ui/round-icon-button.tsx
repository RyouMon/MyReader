import { type ReactNode } from "react";

import { useThemePalette } from "@/src/design/tokens";
import { Pressable, Text } from "@/tw";

export function RoundIconButton({
  label,
  onPress,
  icon,
  size = "default",
}: {
  label: string;
  onPress?: () => void;
  icon?: ReactNode;
  size?: "default" | "large";
}) {
  const palette = useThemePalette();
  const isLarge = size === "large";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className={isLarge ? "min-h-14 min-w-14 items-center justify-center rounded-[20px] px-4" : "min-h-12 min-w-12 items-center justify-center rounded-3xl px-3"}
      onPress={onPress}
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
      }}
    >
      {icon ?? (
        <Text className="text-sm font-semibold" style={{ color: palette.text }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
