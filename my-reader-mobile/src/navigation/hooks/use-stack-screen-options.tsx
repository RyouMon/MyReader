import { router, type NativeStackNavigationOptions } from "expo-router"
import { Platform } from "react-native"

import { AndroidHeaderSlot } from "@/src/components/ui/android-header-layout"
import { HeaderBackButton } from "@/src/components/ui/header-back-button"
import { useThemePalette } from "@/src/design/tokens"

export function useStackScreenOptions(): NativeStackNavigationOptions {
  const palette = useThemePalette()

  const shared: NativeStackNavigationOptions = {
    headerShadowVisible: false,
    headerTintColor: palette.text,
    headerLargeTitleStyle: {
      color: palette.text,
    },
  }

  if (Platform.OS !== "android") {
    return {
      ...shared,
      headerBackVisible: true,
      headerBackButtonDisplayMode: "generic",
    }
  }

  return {
    ...shared,
    headerBackVisible: false,
    headerLeft: ({ canGoBack }) =>
      canGoBack ? (
        <AndroidHeaderSlot side="left">
          <HeaderBackButton onPress={() => router.back()} />
        </AndroidHeaderSlot>
      ) : null,
  }
}
