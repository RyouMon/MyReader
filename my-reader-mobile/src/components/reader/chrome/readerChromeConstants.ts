import type { FixedNavigationMode, ReaderTheme, ReadingLayout } from "@/src/store/app-store.types";

export type ThemeOption = {
  key: ReaderTheme;
  label: string;
  swatch: string;
  fg: string;
};

export const READER_THEME_OPTIONS: readonly ThemeOption[] = [
  { key: "paper", label: "纸张", swatch: "#F1E6D6", fg: "#342B23" },
  { key: "light", label: "浅色", swatch: "#F7F7F6", fg: "#1E1E1E" },
  { key: "green", label: "护眼", swatch: "#DDE8D9", fg: "#24402B" },
  { key: "dark", label: "深色", swatch: "#1D1A17", fg: "#F4EEE6" },
] as const;

export const READING_LAYOUT_OPTIONS: readonly { key: ReadingLayout; label: string }[] = [
  { key: "scroll", label: "滚动" },
  { key: "paginate", label: "左右翻页" },
] as const;

export const FIXED_NAVIGATION_OPTIONS: readonly { key: FixedNavigationMode; label: string }[] = [
  { key: "horizontal", label: "左右翻页" },
  { key: "vertical", label: "上下翻页" },
] as const;
