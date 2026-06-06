import type { NativeStackNavigationOptions } from "expo-router";
import type { RelativePathString } from "expo-router";
import { Platform } from "react-native";

import { HeaderCloseButton } from "@/src/components/ui/button";

import { SETTINGS_DISMISS_TARGETS } from "./policies/settings-routes";

/** iOS modal screens that close back to settings root via layout headerLeft. */
export function settingsModalLayoutCloseOptions(
  fallbackRoute: RelativePathString = SETTINGS_DISMISS_TARGETS.settingsRoot,
): NativeStackNavigationOptions {
  if (Platform.OS !== "ios") {
    return {};
  }

  return {
    headerLeft: () => <HeaderCloseButton fallbackRoute={fallbackRoute} />,
    headerBackVisible: false,
  };
}
