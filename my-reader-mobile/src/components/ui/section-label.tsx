import { type ReactNode } from "react";

import { useThemePalette } from "@/src/design/tokens";
import { Text } from "@/tw";

/** Section label above grouped list rows — body size, bold. */
export function SectionLabel({ children }: { children: ReactNode }) {
  const palette = useThemePalette();
  return (
    <Text className="px-4 text-base font-bold" style={{ color: palette.textMuted }}>
      {children}
    </Text>
  );
}
