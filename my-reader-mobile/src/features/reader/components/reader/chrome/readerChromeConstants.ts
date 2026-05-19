import type { FixedNavigationMode, ReaderTheme, ReadingLayout } from "@/src/store/app-store.types";

export type ThemeOption = {
  key: ReaderTheme;
  label: string;
  swatch: string;
  fg: string;
};

export const READER_THEME_OPTIONS: readonly ThemeOption[] = [
  { key: "paper", label: "reader.themePaper", swatch: "#F1E6D6", fg: "#342B23" },
  { key: "light", label: "reader.themeLight", swatch: "#F7F7F6", fg: "#1E1E1E" },
  { key: "green", label: "reader.themeGreen", swatch: "#DDE8D9", fg: "#24402B" },
  { key: "dark", label: "reader.themeDark", swatch: "#1D1A17", fg: "#F4EEE6" },
] as const;

export const READING_LAYOUT_OPTIONS: readonly { key: ReadingLayout; label: string }[] = [
  { key: "scroll", label: "reader.layoutScroll" },
  { key: "paginate", label: "reader.layoutPaginate" },
] as const;

export const FIXED_NAVIGATION_OPTIONS: readonly { key: FixedNavigationMode; label: string }[] = [
  { key: "horizontal", label: "reader.navHorizontal" },
  { key: "vertical", label: "reader.navVertical" },
] as const;
