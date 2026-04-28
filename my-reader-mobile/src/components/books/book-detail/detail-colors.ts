import type { ThemePalette } from "../../../design/tokens";
import type { DetailColors } from "./types";

export function getDetailColors(
  palette: ThemePalette,
  colorScheme: string | null | undefined
): DetailColors {
  const isDark = colorScheme === "dark";

  return {
    accent: isDark ? "#D4703A" : "#C4622D",
    accentPressed: "#B05523",
    accentText: isDark ? "#1C1714" : "#FAF6F0",
    background: palette.background,
    border: palette.border,
    borderSubtle: isDark ? "rgba(240, 235, 225, 0.06)" : "rgba(28, 23, 20, 0.06)",
    muted: palette.textMuted,
    palette,
    progressTrack: isDark ? "#382F27" : "#EDE8DF",
    success: isDark ? "#55A884" : "#3A7D5A",
    tertiary: isDark ? "#7A7068" : "#9C9089",
    text: palette.text,
  };
}
