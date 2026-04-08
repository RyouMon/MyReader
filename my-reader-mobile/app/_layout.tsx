import "../src/global.css";

import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { LibraryProvider } from "@/src/data/library-context";
import { ThemeProvider, useTheme } from "@/src/design/tokens";

function RootNavigator() {
  const { colorScheme, palette } = useTheme();

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
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LibraryProvider>
        <RootNavigator />
      </LibraryProvider>
    </ThemeProvider>
  );
}
