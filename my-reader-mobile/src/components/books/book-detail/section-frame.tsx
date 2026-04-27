import type { ReactNode } from "react";

import { FONT_DISPLAY, FONT_UI } from "../../../design/typography";
import { Text, View } from "../../../tw";
import type { DetailColors } from "./types";

export function SectionFrame({ children, colors }: { children: ReactNode; colors: DetailColors }) {
  return (
    <View className="gap-[10px] px-4 pb-4" style={{ backgroundColor: colors.sectionBg }}>
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
    <View
      className="flex-row items-center justify-between pb-[10px]"
      style={{ borderBottomColor: colors.border, borderBottomWidth: detail ? 0 : 1 }}
    >
      <Text
        className="text-[16px] leading-6"
        style={{ color: colors.text, fontFamily: FONT_DISPLAY, fontWeight: "700" }}
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
