import { type ReactNode } from "react";

import { useThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  const palette = useThemePalette();

  return (
    <View
      className="items-center gap-3 rounded-[24px] px-6 py-8"
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
      }}
    >
      <Text
        selectable
        className="text-[20px] leading-7"
        style={{ color: palette.text, fontWeight: "700" }}
      >
        {title}
      </Text>
      <Text
        selectable
        className="text-center text-sm leading-6"
        style={{ color: palette.textMuted }}
      >
        {detail}
      </Text>
      {action}
    </View>
  );
}
