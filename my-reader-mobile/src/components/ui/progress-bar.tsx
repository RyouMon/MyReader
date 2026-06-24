import { useThemePalette } from "@/src/design/tokens";
import { View } from "@/tw";

type ProgressBarProps = {
  progress: number;
  rounded?: boolean;
};

export function ProgressBar({ progress, rounded = true }: ProgressBarProps) {
  const palette = useThemePalette();
  const radiusClass = rounded ? "rounded-full" : "";

  return (
    <View className={`h-2 overflow-hidden ${radiusClass}`} style={{ backgroundColor: palette.backgroundSecondary }}>
      <View
        className={`h-full ${radiusClass}`}
        style={{ backgroundColor: palette.primary, width: `${Math.max(0, Math.min(progress, 1)) * 100}%` }}
      />
    </View>
  );
}
