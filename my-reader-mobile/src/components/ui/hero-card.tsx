import { type ReactNode } from "react";

import { useThemePalette } from "@/src/design/tokens";
import { View } from "@/tw";

export function HeroCard({ children }: { children: ReactNode }) {
  const palette = useThemePalette();

  return (
    <View
      className="rounded-[28px] p-4"
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
        boxShadow: "0 10px 30px rgba(61, 43, 26, 0.08)",
      }}
    >
      {children}
    </View>
  );
}
