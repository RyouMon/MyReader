import { type ReactNode } from "react";

import { useThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

export function PageHeader({
  title,
  trailing,
  subtitle,
}: {
  title: string;
  trailing?: ReactNode;
  subtitle?: string;
}) {
  const palette = useThemePalette();

  return (
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1 gap-1">
        <Text
          selectable
          className="text-[34px] leading-[40px]"
          style={{ color: palette.text, fontWeight: "700", letterSpacing: -0.4 }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text selectable className="text-sm leading-5" style={{ color: palette.textMuted }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}
