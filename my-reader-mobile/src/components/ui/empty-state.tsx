import { useMemo, type ReactNode } from "react";

import { useThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

/**
 * Renders a mobile-first empty state card with optional action slot.
 */
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
  const styles = useMemo(
    () => ({
      card: {
        backgroundColor: palette.surface,
        borderColor: palette.border,
      },
      iconHalo: {
        backgroundColor: palette.backgroundSecondary,
      },
      iconCore: {
        backgroundColor: palette.background,
        borderColor: palette.border,
      },
      title: {
        color: palette.text,
        fontWeight: "700" as const,
      },
      detail: {
        color: palette.textMuted,
      },
      actionWrap: {
        borderTopColor: palette.border,
      },
    }),
    [palette]
  );

  return (
    <View className="flex-1 justify-center px-1 py-8">
      <View className="rounded-3xl border p-6" style={styles.card}>
        <View className="items-center gap-5">
          <View className="h-20 w-20 items-center justify-center rounded-full" style={styles.iconHalo}>
            <View className="h-12 w-12 items-center justify-center rounded-full border" style={styles.iconCore}>
              <Text className="text-xl">📚</Text>
            </View>
          </View>
          <View className="items-center gap-2">
            <Text selectable className="text-center text-[22px] leading-8" style={styles.title}>
              {title}
            </Text>
            <Text selectable className="text-center text-[15px] leading-6" style={styles.detail}>
              {detail}
            </Text>
          </View>
        </View>
        {action ? (
          <View className="mt-6 border-t pt-5" style={styles.actionWrap}>
            {action}
          </View>
        ) : null}
      </View>
    </View>
  );
}
