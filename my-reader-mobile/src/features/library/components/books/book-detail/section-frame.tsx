import type { ReactNode } from "react";

import { FONT_DISPLAY, FONT_UI } from "@/src/design/typography";
import { Text, View } from "@/tw";
import type { DetailColors } from "./types";

export function SectionFrame({ children, colors }: { children: ReactNode; colors: DetailColors }) {
  return (
    <View className="gap-4 px-4 py-5" style={{ borderTopColor: colors.border, borderTopWidth: 1 }}>
      {children}
    </View>
  );
}

export function SectionHeader({
  colors,
  detail,
  title,
}: {
  colors: DetailColors;
  detail?: string;
  title: string;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text
        className="text-lg leading-7"
        style={{ color: colors.text, fontFamily: FONT_DISPLAY, fontWeight: "600" }}
      >
        {title}
      </Text>
      {detail ? (
        <Text className="text-xs leading-4" style={{ color: colors.tertiary, fontFamily: FONT_UI }}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
