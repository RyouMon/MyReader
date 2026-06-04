import { type ReactNode } from "react";

import { useThemePalette } from "@/src/design/tokens";
import { Text } from "@/tw";

/** Section title above grouped settings rows — body size, bold. */
export function SettingsSectionLabel({ children }: { children: ReactNode }) {
  const palette = useThemePalette();
  return (
    <Text className="px-4 text-[16px] leading-6 font-bold" style={{ color: palette.text }}>
      {children}
    </Text>
  );
}
