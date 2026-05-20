import type { ReaderTheme } from "@/src/store/app-store.types";

export type ThemeOption = {
  key: ReaderTheme;
  swatch: string;
  fg: string;
  label: string;
};

export const READER_THEME_OPTIONS: ThemeOption[] = [
  { key: "neutral",   swatch: "#FFFFFF", fg: "#2C2420", label: "reader.themeNeutral" },
  { key: "paper",     swatch: "#F5EDDF", fg: "#5B4636", label: "reader.themePaper" },
  { key: "sepia",     swatch: "#F1E7D0", fg: "#5F4B37", label: "reader.themeSepia" },
  { key: "green",     swatch: "#CCE8CC", fg: "#2D4A2D", label: "reader.themeGreen" },
  { key: "ocean",     swatch: "#D0E0F0", fg: "#2D3E5F", label: "reader.themeOcean" },
  { key: "contrast1", swatch: "#F5E6D3", fg: "#1A1A1A", label: "reader.themeContrast1" },
  { key: "night",     swatch: "#2C2420", fg: "#D4CBC3", label: "reader.themeNight" },
  { key: "contrast2", swatch: "#000000", fg: "#CCCCCC", label: "reader.themeContrast2" },
];
