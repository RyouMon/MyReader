import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";

import { useThemePalette } from "@/src/design/tokens";

export function useStackScreenOptions(): NativeStackNavigationOptions {
  const palette = useThemePalette();

  return {
    headerBackVisible: true,
    headerBackButtonDisplayMode: "generic",
    headerShadowVisible: false,
    headerTintColor: palette.text,
    headerLargeTitleStyle: {
      color: palette.text,
    },
  };
}
