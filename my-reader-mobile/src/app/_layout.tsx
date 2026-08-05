import "@/src/global.css"
import "@/src/i18n"
import "@/src/polyfills/reader-engine-globals"

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from "expo-router/react-navigation"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { useEffect, useRef, type ComponentProps } from "react"
import { Platform, View as RNView } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { NotifierWrapper } from "react-native-notifier"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { ErrorBoundary } from "@/src/components/error-boundary"
import { setAlertStatusBarPreferredStyle } from "@/src/constants/alert-with-status-bar"
import { ThemeProvider, useTheme } from "@/src/design/tokens"
import { hydrateLibraries } from "@/src/domain/library/hooks/library-actions"
import { initializeDownloadNotifications } from "@/src/domain/notifications/download-notifications"
import { useAppStore } from "@/src/store/app-store"
import { SyncRuntime } from "@/src/domain/sync/components/SyncRuntime"
import { BookUploadRuntime } from "@/src/domain/sync/components/BookUploadRuntime"
import { setupGlobalErrorHandler } from "@/src/errors/global-handler"
import { LibrarySyncPill } from "@/src/features/library/components/library-sync-pill"
import { setReaderTransitionRootNode } from "@/src/features/reader/reader-open-transition"
import { ReaderOpenTransitionHost } from "@/src/features/reader/reader-open-transition-overlay"
import { useDataSourceActions } from "@/src/hooks/use-data-source-actions"
import { AppLanguageProvider } from "@/src/i18n/app-language-provider"
import { queryClient } from "@/src/services/query/query-client"
import * as Sentry from "@sentry/react-native"
import { QueryClientProvider } from "@tanstack/react-query"

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN
if (sentryDsn) {
  const sentryReplayEnabled =
    process.env.EXPO_PUBLIC_SENTRY_REPLAY_ENABLED === "true"
  // Session Replay captures native view snapshots, so keep it opt-in during
  // list-performance profiling and normal development builds.
  const sentryIntegrations = [
    ...(sentryReplayEnabled ? [Sentry.mobileReplayIntegration()] : []),
    Sentry.feedbackIntegration(),
  ]

  Sentry.init({
    dsn: sentryDsn,

    // Adds more context data to events (IP address, cookies, user, etc.)
    // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
    sendDefaultPii: true,

    // Enable Logs
    enableLogs: true,

    // Configure Session Replay
    replaysSessionSampleRate: sentryReplayEnabled ? 0.1 : 0,
    replaysOnErrorSampleRate: sentryReplayEnabled ? 1 : 0,
    integrations: sentryIntegrations,

    // uncomment the line below to enable Spotlight (https://spotlightjs.com)
    // spotlight: __DEV__,
  })
}

function RootNavigator() {
  const { colorScheme, palette } = useTheme()
  const statusBarStyle = colorScheme === "dark" ? "light" : "dark"
  const storeReady = useAppStore((s) => s.storeReady)
  const hydrateDataSources = useDataSourceActions().hydrateFromBackend

  /**
   * Keeps alert status bar restoration aligned with app theme mode.
   */
  useEffect(() => {
    setAlertStatusBarPreferredStyle(statusBarStyle)
  }, [statusBarStyle])

  useEffect(() => {
    initializeDownloadNotifications()
  }, [])

  useEffect(() => {
    if (!storeReady) {
      return
    }
    void hydrateDataSources().then(() => hydrateLibraries())
  }, [storeReady, hydrateDataSources])

  const navigationTheme =
    colorScheme === "dark"
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
        }

  return (
    <>
      <NavigationThemeProvider value={navigationTheme}>
        <StatusBar style={statusBarStyle} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="handle-share"
            options={{ presentation: "fullScreenModal" }}
          />
          <Stack.Screen name="book" options={{ presentation: "modal" }} />
          <Stack.Screen
            name="library-book"
            options={{ presentation: "modal" }}
          />
          <Stack.Screen
            name="reader"
            options={{
              presentation: Platform.OS === "ios" ? "fullScreenModal" : "card",
              animation: "none",
              gestureEnabled: false,
              headerShown: false,
              headerTitle: "",
            }}
          />
        </Stack>
      </NavigationThemeProvider>
      <ReaderOpenTransitionHost />
      <BookUploadRuntime />
      <SyncRuntime />
      <LibrarySyncPill />
    </>
  )
}

type NotifierChildren = ComponentProps<typeof NotifierWrapper>["children"]

function NotifierWithSafeArea({ children }: { children: NotifierChildren }) {
  const { top } = useSafeAreaInsets()
  return (
    <NotifierWrapper containerStyle={{ marginTop: top }}>
      {children}
    </NotifierWrapper>
  )
}

export default Sentry.wrap(function RootLayout() {
  // RN 运行时在首次渲染前已就绪，此处调用是最早的安全时机。
  // setupGlobalErrorHandler 内部有幂等保护，重渲染不会重复注册。
  setupGlobalErrorHandler()
  const transitionRootRef = useRef<RNView>(null)

  useEffect(() => {
    setReaderTransitionRootNode(transitionRootRef.current)
    return () => setReaderTransitionRootNode(null)
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AppLanguageProvider>
            <ErrorBoundary>
              <NotifierWithSafeArea>
                <RNView
                  ref={transitionRootRef}
                  collapsable={false}
                  style={{ flex: 1 }}
                >
                  <RootNavigator />
                </RNView>
              </NotifierWithSafeArea>
            </ErrorBoundary>
          </AppLanguageProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
})
