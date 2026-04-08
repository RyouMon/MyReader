import { type ReactNode } from "react";

import { useThemePalette } from "@/src/design/tokens";
import { ScrollView, View } from "@/tw";

export function Screen({ children }: { children: ReactNode }) {
  const palette = useThemePalette();

  return (
    <ScrollView
      className="flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="px-4 pt-4 pb-10"
      style={{ backgroundColor: palette.background }}
    >
      <View className="gap-5">{children}</View>
    </ScrollView>
  );
}
