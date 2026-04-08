import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";

export function useStackScreenOptions(): NativeStackNavigationOptions {
  return {
    headerBackVisible: true,
    headerBackButtonDisplayMode: "generic",
    headerShadowVisible: false,
  };
}
