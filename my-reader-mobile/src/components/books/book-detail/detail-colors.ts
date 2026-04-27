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
    background: isDark ? "#1C1814" : "#F7F3EC",
    border: isDark ? "rgba(240, 235, 225, 0.12)" : "rgba(28, 23, 20, 0.10)",
    card: isDark ? "#26211D" : "#FFFFFF",
    disabledBg: isDark ? "#2F2923" : "#F5F1EA",
    disabledText: isDark ? "#B8AFA6" : "#5C5349",
    muted: isDark ? "#B8AFA6" : "#5C5349",
    palette,
    progressTrack: isDark ? "#382F27" : "#EDE8DF",
    sectionBg: isDark ? "#1C1814" : "#F7F3EC",
    success: isDark ? "#55A884" : "#3A7D5A",
    successBg: isDark ? "#1E3D2E" : "#C2DDD0",
    tagBg: isDark ? "#5A3020" : "#E8C9B5",
    tagText: isDark ? "#FAFAFA" : "#0A0A0A",
    tertiary: isDark ? "#7A7068" : "#9C9089",
    text: isDark ? "#F0EBE1" : "#1C1714",
  };
}
