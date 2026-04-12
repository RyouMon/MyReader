import { Platform, PlatformColor, type ColorValue } from "react-native";

const WEB_DESTRUCTIVE = "#D53030";

/**
 * Platform-defined red for delete / irreversible actions.
 * iOS: `UIColor.systemRed`; Android: Material `colorError` (API 26+) or holo red fallback.
 */
export function getSemanticDestructiveColor(): ColorValue {
  if (Platform.OS === "ios") {
    return PlatformColor("systemRed");
  }

  if (Platform.OS === "android") {
    const api = typeof Platform.Version === "number" ? Platform.Version : 0;
    if (api >= 26) {
      return PlatformColor("?android:attr/colorError");
    }
    return PlatformColor("@android:color/holo_red_dark");
  }

  return WEB_DESTRUCTIVE;
}

/**
 * Foreground on a solid {@link getSemanticDestructiveColor} background (e.g. swipe-delete pill).
 */
export function getSemanticOnDestructiveColor(): ColorValue {
  if (Platform.OS === "android") {
    const api = typeof Platform.Version === "number" ? Platform.Version : 0;
    if (api >= 26) {
      return PlatformColor("?android:attr/colorOnError");
    }
  }

  return "#FFFFFF";
}
