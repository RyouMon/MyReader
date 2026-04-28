import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

type CircularProgressProps = {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
};

/**
 * Renders a precise circular progress ring using react-native-svg.
 * Progress is clamped to 0–1 and works consistently on iOS and Android.
 */
export function CircularProgress({
  progress,
  size = 14,
  strokeWidth = 1.5,
  color = "#000",
  trackColor = "rgba(0,0,0,0.12)",
}: CircularProgressProps) {
  const half = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const normalizedProgress = Math.min(1, Math.max(0, progress));
  const strokeDashoffset = circumference - normalizedProgress * circumference;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={half}
          cy={half}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={half}
          cy={half}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90, ${half}, ${half})`}
        />
      </Svg>
    </View>
  );
}
