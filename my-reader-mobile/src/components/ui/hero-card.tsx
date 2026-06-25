import { type ReactNode } from "react";

import { useThemePalette } from "@/src/design/tokens";
import { View } from "@/tw";

export function HeroCard({ children }: { children: ReactNode }) {
  const palette = useThemePalette();

  return (
    <View
      className="rounded-[28px]"
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
        boxShadow: palette.shadowMd,
      }}
    >
      {children}
    </View>
  );
}
