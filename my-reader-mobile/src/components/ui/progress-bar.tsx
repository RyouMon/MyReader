import { useThemePalette } from "@/src/design/tokens";
import { View } from "@/tw";

export function ProgressBar({ progress }: { progress: number }) {
  const palette = useThemePalette();

  return (
    <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: palette.surfaceMuted }}>
      <View
        className="h-full rounded-full"
        style={{ backgroundColor: palette.primary, width: `${Math.max(0, Math.min(progress, 1)) * 100}%` }}
      />
    </View>
  );
}
