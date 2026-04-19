import { type ReactNode } from "react";

import { useThemePalette } from "@/src/design/tokens";
import { Text } from "@/tw";

/**
 * Muted small-caps label placed above grouped settings rows (e.g. before SectionCard).
 */
export function SettingsSectionLabel({ children }: { children: ReactNode }) {
  const palette = useThemePalette();
  return (
    <Text className="px-1 text-xs font-semibold uppercase tracking-[0.4px]" style={{ color: palette.textMuted }}>
      {children}
    </Text>
  );
}
