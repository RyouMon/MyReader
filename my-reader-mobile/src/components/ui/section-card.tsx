import { type ReactNode } from "react";

import { useThemePalette } from "@/src/design/tokens";
import { View } from "@/tw";

export function SectionCard({ children }: { children: ReactNode }) {
  const palette = useThemePalette();

  return (
    <View
      className="overflow-hidden rounded-[24px]"
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
      }}
    >
      {children}
    </View>
  );
}
