import type { NativeStackNavigationOptions } from "expo-router"
import { StyleSheet } from "react-native"

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
    headerTitleStyle: {
      ...StyleSheet.flatten(baseOptions.headerTitleStyle),
      color: foregroundColor,
    },
    headerTransparent: true,
  }
}
