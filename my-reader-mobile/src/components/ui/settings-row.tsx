import { type ReactNode } from "react";

import { useThemePalette } from "@/src/design/tokens";
import { Pressable, Text, View } from "@/tw";

export function SettingsRow({
  title,
  detail,
  trailing,
  onPress,
  isLast,
}: {
  title: string;
  detail?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  isLast?: boolean;
}) {
  const palette = useThemePalette();

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      className="min-h-16 flex-row items-center justify-between gap-3 px-4 py-4"
      onPress={onPress}
      style={{ borderBottomColor: palette.border, borderBottomWidth: isLast ? 0 : 1 }}
    >
      <View className="flex-1 gap-1">
        <Text selectable className="text-[16px] leading-6" style={{ color: palette.text, fontWeight: "700" }}>
          {title}
        </Text>
        {detail ? (
          <Text selectable className="text-[13px] leading-5" style={{ color: palette.textMuted }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}
