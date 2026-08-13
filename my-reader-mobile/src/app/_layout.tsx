import "@/src/global.css"
import "@/src/i18n"
import "@/src/polyfills/reader-engine-globals"

import { QueryClientProvider } from "@tanstack/react-query"
import { Stack } from "expo-router"
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from "expo-router/react-navigation"
import { StatusBar } from "expo-status-bar"
import { type ComponentProps, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Platform, View as RNView } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { NotifierWrapper } from "react-native-notifier"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { DiagnosticsRuntime } from "@/src/components/diagnostics-runtime"
import { ErrorBoundary } from "@/src/components/error-boundary"
import { setAlertStatusBarPreferredStyle } from "@/src/constants/alert-with-status-bar"
import { ThemeProvider, useTheme } from "@/src/design/tokens"
import { hydrateLibraries } from "@/src/domain/library/hooks/library-actions"
import { initializeDownloadNotifications } from "@/src/domain/notifications/download-notifications"
import { BookUploadRuntime } from "@/src/domain/sync/components/BookUploadRuntime"
import { SyncRuntime } from "@/src/domain/sync/components/SyncRuntime"
import { setupGlobalErrorHandler } from "@/src/errors/global-handler"
import { setReaderTransitionRootNode } from "@/src/features/reader/reader-open-transition"
import { ReaderOpenTransitionHost } from "@/src/features/reader/reader-open-transition-overlay"
import { useDataSourceActions } from "@/src/hooks/use-data-source-actions"
import { AppLanguageProvider } from "@/src/i18n/app-language-provider"
import { queryClient } from "@/src/services/query/query-client"
import { useAppStore } from "@/src/store/app-store"

function RootNavigator() {
  const { colorScheme, palette } = useTheme()
  const { t } = useTranslation()
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
            name="(add-library)"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="switch-library"
            options={{
              contentStyle: { backgroundColor: palette.background },
              headerBackVisible: false,
              headerLargeTitle: false,
              headerShown: Platform.OS === "ios",
              presentation: "formSheet",
              sheetAllowedDetents: [1],
              sheetGrabberVisible: true,
              title: t("library.allLibraries"),
            }}
          />
          <Stack.Screen
            name="sync-status"
            options={{
              contentStyle: { backgroundColor: palette.background },
              headerShown: false,
              presentation: "formSheet",
              sheetAllowedDetents: [0.85],
              sheetGrabberVisible: false,
            }}
          />
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

export default function RootLayout() {
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
              <DiagnosticsRuntime />
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
}
