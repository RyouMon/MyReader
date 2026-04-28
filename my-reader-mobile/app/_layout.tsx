import "@/src/polyfills/reader-engine-globals";
import "../src/global.css";

import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NotifierWrapper } from "react-native-notifier";

import { setAlertStatusBarPreferredStyle } from "@/src/constants/alert-with-status-bar";
import { getAppDatabase } from "@/src/data/sqlite";
import { ThemeProvider, useTheme } from "@/src/design/tokens";
import { initializeDownloadNotifications } from "@/src/notifications/download-notifications";
import { useSyncLifecycle } from "@/src/sync/useSyncLifecycle";

function RootNavigator() {
  const { colorScheme, palette } = useTheme();
  const statusBarStyle = colorScheme === "dark" ? "light" : "dark";

  /**
   * Keeps alert status bar restoration aligned with app theme mode.
   */
  useEffect(() => {
    setAlertStatusBarPreferredStyle(statusBarStyle);
  }, [statusBarStyle]);

  /**
   * Warm the persistent app database once so file_state/sync_meta schema
   * exists before any sync flow is invoked.
   */
  useEffect(() => {
    try {
      getAppDatabase();
    } catch (error) {
      console.error("[MyReader] 初始化本地 SQLite 失败", error);
    }
  }, []);

  useSyncLifecycle();

  /**
   * Initializes local notification behavior used by download tasks.
   */
  useEffect(() => {
    initializeDownloadNotifications();
  }, []);

  const navigationTheme = colorScheme === "dark"
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: palette.background,
          card: palette.backgroundSecondary,
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
          card: palette.backgroundSecondary,
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
        <Stack.Screen name="book" />
        <Stack.Screen name="library-book" />
        <Stack.Screen
          name="reader"
          options={{
            presentation: "fullScreenModal",
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
        <NotifierWrapper>
          <RootNavigator />
        </NotifierWrapper>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
