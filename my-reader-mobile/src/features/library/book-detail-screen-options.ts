import type { NativeStackNavigationOptions } from "expo-router"

export function buildBookDetailScreenOptions(
  baseOptions: NativeStackNavigationOptions,
  foregroundColor: string,
  hideTitle: boolean,
): NativeStackNavigationOptions {
  return {
    ...baseOptions,
    title: hideTitle ? "" : baseOptions.title,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: "transparent" },
    headerTintColor: foregroundColor,
    headerTitleStyle: { color: foregroundColor },
    headerTransparent: true,
  }
}
