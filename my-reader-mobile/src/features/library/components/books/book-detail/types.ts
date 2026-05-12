import type { ThemePalette } from "@/src/design/tokens";

export type DetailColors = {
  accent: string;
  accentPressed: string;
  accentText: string;
  background: string;
  border: string;
  borderSubtle: string;
  muted: string;
  palette: ThemePalette;
  progressTrack: string;
  success: string;
  tertiary: string;
  text: string;
};

export type InfoCardItem = {
  label: string;
  mono?: boolean;
  value: string;
};
