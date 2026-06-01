import "@/src/global.css";
import "@/src/i18n";
import "@/src/polyfills/reader-engine-globals";

import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, type ComponentProps } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NotifierWrapper } from "react-native-notifier";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { setAlertStatusBarPreferredStyle } from "@/src/constants/alert-with-status-bar";
import { ThemeProvider, useTheme } from "@/src/design/tokens";
import { initializeDownloadNotifications } from "@/src/domain/notifications/download-notifications";
import { SyncRuntime } from "@/src/domain/sync/components/SyncRuntime";
import { setupGlobalErrorHandler } from "@/src/errors/global-handler";
import { LibrarySyncPill } from "@/src/features/library/components/library-sync-pill";
import { queryClient } from "@/src/services/query/query-client";
import * as Sentry from '@sentry/react-native';
import { QueryClientProvider } from "@tanstack/react-query";

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,

    // Adds more context data to events (IP address, cookies, user, etc.)
    // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
    sendDefaultPii: true,

    // Enable Logs
    enableLogs: true,

    // Configure Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

    // uncomment the line below to enable Spotlight (https://spotlightjs.com)
    // spotlight: __DEV__,
  });
}

function RootNavigator() {
  const { colorScheme, palette } = useTheme();
  const statusBarStyle = colorScheme === "dark" ? "light" : "dark";

  /**
   * Keeps alert status bar restoration aligned with app theme mode.
   */
  useEffect(() => {
    setAlertStatusBarPreferredStyle(statusBarStyle);
  }, [statusBarStyle]);

  useEffect(() => {
    initializeDownloadNotifications();
  }, []);

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
    <>
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
              headerShown: false,
              headerTitle: "",
            }}
          />
        </Stack>
      </NavigationThemeProvider>
      <SyncRuntime />
      <LibrarySyncPill />
    </>
  );
}

type NotifierChildren = ComponentProps<typeof NotifierWrapper>["children"];

function NotifierWithSafeArea({ children }: { children: NotifierChildren }) {
  const { top } = useSafeAreaInsets();
  return <NotifierWrapper containerStyle={{ marginTop: top }}>{children}</NotifierWrapper>;
}

export default Sentry.wrap(function RootLayout() {
  // RN 运行时在首次渲染前已就绪，此处调用是最早的安全时机。
  // setupGlobalErrorHandler 内部有幂等保护，重渲染不会重复注册。
  setupGlobalErrorHandler();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ErrorBoundary>
            <NotifierWithSafeArea>
              <RootNavigator />
            </NotifierWithSafeArea>
          </ErrorBoundary>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
});
