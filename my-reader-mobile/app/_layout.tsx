import "@/src/polyfills/reader-engine-globals";
import "../src/global.css";

import { useEffect } from "react";
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { setAlertStatusBarPreferredStyle } from "@/src/constants/alert-with-status-bar";
import { ThemeProvider, useTheme } from "@/src/design/tokens";

function RootNavigator() {
  const { colorScheme, palette } = useTheme();
  const statusBarStyle = colorScheme === "dark" ? "light" : "dark";

  /**
   * Keeps alert status bar restoration aligned with app theme mode.
   */
  useEffect(() => {
    setAlertStatusBarPreferredStyle(statusBarStyle);
  }, [statusBarStyle]);

  const navigationTheme = colorScheme === "dark"
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: palette.background,
          card: palette.surface,
          text: palette.text,
          border: palette.border,
          primary: palette.primary,
          notification: palette.primary,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: palette.background,
          card: palette.surface,
          text: palette.text,
          border: palette.border,
          primary: palette.primary,
          notification: palette.primary,
        },
      };

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={statusBarStyle} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="reader"
          options={{
            animation: "fade",
            gestureEnabled: false,
          }}
        />
      </Stack>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <RootNavigator />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
