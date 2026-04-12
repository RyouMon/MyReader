import type { TextStyle, ViewStyle } from "react-native";

/** 与阅读器 chrome 琥珀强调一致（书签、选中分段等） */
export const READER_CHROME_ACCENT_HEX = "#C9874E";

const ACCENT_SURFACE_SEGMENT = "rgba(201,135,78,0.15)";
const ACCENT_SURFACE_THEME = "rgba(201,135,78,0.13)";
const ACCENT_BORDER = "rgba(201,135,78,0.32)";
const ACCENT_BORDER_TOC = "rgba(201,135,78,0.3)";
const NEUTRAL_SURFACE_06 = "rgba(255,255,255,0.06)";
const NEUTRAL_SURFACE_05 = "rgba(255,255,255,0.05)";
const BORDER_IDLE = "rgba(255,255,255,0.06)";
const TOC_LABEL_MUTED = "rgba(255,255,255,0.8)";
const TOP_BAR_ICON_IDLE = "#F4EEE6";

/**
 * 设置面板内「分段」控件（阅读方式、翻页方向）的背景与描边。
 */
export function chromeSegmentSurfaceStyle(
  active: boolean
): Pick<ViewStyle, "backgroundColor" | "borderColor"> {
  return {
    backgroundColor: active ? ACCENT_SURFACE_SEGMENT : NEUTRAL_SURFACE_06,
    borderColor: active ? ACCENT_BORDER : BORDER_IDLE,
  };
}

/**
 * 设置面板内主题色卡可选态的背景与描边。
 */
export function chromeThemeCardSurfaceStyle(
  active: boolean
): Pick<ViewStyle, "backgroundColor" | "borderColor"> {
  return {
    backgroundColor: active ? ACCENT_SURFACE_THEME : NEUTRAL_SURFACE_05,
    borderColor: active ? ACCENT_BORDER : BORDER_IDLE,
  };
}

/**
 * 目录列表每一项容器的背景与边框。
 */
export function chromeTocRowContainerStyle(active: boolean): ViewStyle {
  return {
    backgroundColor: active ? ACCENT_SURFACE_SEGMENT : NEUTRAL_SURFACE_06,
    borderWidth: active ? 1 : 0,
    borderColor: active ? ACCENT_BORDER_TOC : "transparent",
  };
}

/**
 * 目录列表项主行文字颜色与字重。
 */
export function chromeTocRowLabelStyle(
  active: boolean,
  activeTextColor: string
): Pick<TextStyle, "color" | "fontWeight"> {
  return {
    color: active ? activeTextColor : TOC_LABEL_MUTED,
    fontWeight: active ? "700" : "500",
  };
}

/**
 * 顶栏书签图标颜色（激活时为强调色，否则为默认奶油色）。
 */
export function chromeTopBarBookmarkIconColor(bookmarkActive: boolean): string {
  return bookmarkActive ? READER_CHROME_ACCENT_HEX : TOP_BAR_ICON_IDLE;
}
