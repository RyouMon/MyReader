import { Image } from "expo-image";

type CircularProgressProps = {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
};

/**
 * Renders a precise circular progress ring by generating an SVG data URI
 * and displaying it through expo-image. Progress is clamped to 0–1.
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

  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${half}" cy="${half}" r="${radius}" stroke="${trackColor}" stroke-width="${strokeWidth}" fill="none"/><circle cx="${half}" cy="${half}" r="${radius}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}" stroke-linecap="round" transform="rotate(-90 ${half} ${half})"/></svg>`;

  const svgUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;

  return <Image key={svgUri} source={svgUri} style={{ width: size, height: size }} />;
}
