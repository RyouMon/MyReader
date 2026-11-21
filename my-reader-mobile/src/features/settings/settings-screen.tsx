import { errorMessage } from "@/src/i18n/error-message"
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES } from "@my-reader/i18n/languages"
import HeadphonesIcon from "@expo/material-symbols/headphones.xml"
import { Image as ExpoImage } from "expo-image"
import { router, useNavigation } from "expo-router"
import { useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import { FormFieldSwitch } from "@/src/components/ui/form-field-switch"
import {
  ListMenuRow,
  type ListMenuAction,
  ListRow,
  type ListRowIcon,
  Screen,
  SectionCard,
  SectionLabel,
} from "@/src/components"
import { DIAGNOSTICS_AVAILABLE } from "@/src/config/diagnostics"
import {
  COVER_THUMBNAIL_GENERATION_CONCURRENCY_MAX,
  COVER_THUMBNAIL_GENERATION_CONCURRENCY_MIN,
} from "@/src/config/library-list-performance"
import {
  showAlertWithStatusBarRestore,
  showErrorAlert,
} from "@/src/constants/alert-with-status-bar"
import { DEVELOPER_TOOLS_ENABLED } from "@/src/constants/developer-tools"
import { type ThemeMode, useTheme } from "@/src/design/tokens"
import { resolveAppLanguage } from "@/src/i18n"
import { clearBookCoverThumbnailCache } from "@/src/services/core/content"
import { clearCoverThumbnailCache } from "@/src/services/fs/cover-thumbnail-cache"
import { useAppStore } from "@/src/store/app-store"
import type { HomeCardStyle } from "@/src/store/app-store.types"
import { View } from "@/tw"
import { DeveloperConcurrencyControl } from "./components/developer-concurrency-control"
import { AppUpdateSection } from "@/src/features/app-updates/app-update-section"

const SETTINGS_ROW_ICONS = {
  libraries: { ios: "books.vertical", android: "library-books" },
  dataSources: {
    ios: "externaldrive.connected.to.line.below",
    android: "storage",
  },
  language: { ios: "globe", android: "language" },
  llm: { ios: "cpu", android: "memory" },
  tts: {
    ios: "headphones",
    android: "headphones",
    androidSource: HeadphonesIcon,
  },
  darkMode: { ios: "circle.lefthalf.filled", android: "dark-mode" },
  diagnostics: { ios: "shield.lefthalf.filled", android: "privacy-tip" },
  homeCardStyle: { ios: "rectangle.grid.1x2", android: "view-agenda" },
  clearImageCache: { ios: "photo.on.rectangle", android: "image" },
  libraryPerformanceProfiler: { ios: "speedometer", android: "speed" },
  coverLoadingAnimation: { ios: "sparkles", android: "animation" },
  coverThumbnailConcurrency: { ios: "cpu", android: "memory" },
} as const satisfies Record<string, ListRowIcon>

export default function SettingsScreen() {
  const { t } = useTranslation()
  const { mode, setMode } = useTheme()
  const libraries = useAppStore((s) => s.libraries)
  const navigation = useNavigation()
  const isTransitioningRef = useRef(false)

  useEffect(() => {
    // transitionStart/transitionEnd are Stack-specific events; the generic
    // useNavigation() type doesn't expose them but they exist at runtime.
    const nav = navigation as unknown as {
      addListener: (
        event: "transitionStart" | "transitionEnd",
        cb: () => void,
      ) => () => void
    }
    const unsubStart = nav.addListener("transitionStart", () => {
      isTransitioningRef.current = true
    })
    const unsubEnd = nav.addListener("transitionEnd", () => {
      isTransitioningRef.current = false
    })
    return () => {
      unsubStart()
      unsubEnd()
    }
  }, [navigation])

  function navigateTo(href: Parameters<typeof router.push>[0]) {
    if (isTransitioningRef.current) return
    router.push(href)
  }

  async function handleClearImageCache() {
    try {
      const [memoryCleared, diskCleared] = await Promise.all([
        ExpoImage.clearMemoryCache(),
        ExpoImage.clearDiskCache(),
      ])
      clearCoverThumbnailCache()
      await Promise.all(
        libraries.map((library) => clearBookCoverThumbnailCache(library)),
      )

      if (!memoryCleared || !diskCleared) {
        throw new Error(t("settings.developer.clearImageCache.unavailable"))
      }

      showAlertWithStatusBarRestore(
        t("settings.developer.clearImageCache.doneTitle"),
        t("settings.developer.clearImageCache.doneDetail"),
      )
    } catch (error) {
      showErrorAlert(
        t("settings.developer.clearImageCache.errorTitle"),
        errorMessage(error),
      )
    }
  }

  const themeModeLabels: Record<ThemeMode, string> = useMemo(
    () => ({
      system: t("settings.themeMode.system"),
      light: t("settings.themeMode.light"),
      dark: t("settings.themeMode.dark"),
    }),
    [t],
  )
  const themeMode = themeModeLabels[mode]
  const themeMenuActions = useMemo<ListMenuAction[]>(() => {
    const themeModes = [
      t("settings.themeMode.system"),
      t("settings.themeMode.light"),
      t("settings.themeMode.dark"),
    ]
    const themeModeMap: Record<string, ThemeMode> = {
      [t("settings.themeMode.system")]: "system",
      [t("settings.themeMode.light")]: "light",
      [t("settings.themeMode.dark")]: "dark",
    }
    return themeModes.map((nextMode) => ({
      id: `theme:${themeModeMap[nextMode]}`,
      title: nextMode,
      state: nextMode === themeMode ? "on" : "off",
    }))
  }, [t, themeMode])

  const language = useAppStore((s) => s.settings.language)
  const setLanguage = useAppStore((s) => s.setLanguage)
  const effectiveLanguage =
    language && language !== "system" ? resolveAppLanguage(language) : "system"
  const languageLabels = useMemo<Record<string, string>>(
    () => ({
      ...LANGUAGE_NAMES,
      system: t("settings.themeMode.system"),
    }),
    [t],
  )
  const languageMenuActions = useMemo<ListMenuAction[]>(
    () =>
      ["system", ...SUPPORTED_LANGUAGES].map((lang) => ({
        id: `lang:${lang}`,
        title: languageLabels[lang] ?? lang,
        state: effectiveLanguage === lang ? "on" : "off",
      })),
    [effectiveLanguage, languageLabels],
  )

  const homeCardStyle = useAppStore((s) => s.settings.homeCardStyle)
  const setHomeCardStyle = useAppStore((s) => s.setHomeCardStyle)
  const diagnosticsEnabled = useAppStore((s) => s.settings.diagnosticsEnabled)
  const setDiagnosticsEnabled = useAppStore((s) => s.setDiagnosticsEnabled)
  const libraryPerformanceProfilerEnabled = useAppStore(
    (s) => s.settings.libraryPerformanceProfilerEnabled,
  )
  const setLibraryPerformanceProfilerEnabled = useAppStore(
    (s) => s.setLibraryPerformanceProfilerEnabled,
  )
  const coverLoadingSkeletonPulseEnabled = useAppStore(
    (s) => s.settings.coverLoadingSkeletonPulseEnabled,
  )
  const setCoverLoadingSkeletonPulseEnabled = useAppStore(
    (s) => s.setCoverLoadingSkeletonPulseEnabled,
  )
  const coverThumbnailGenerationConcurrency = useAppStore(
    (s) => s.settings.coverThumbnailGenerationConcurrency,
  )
  const setCoverThumbnailGenerationConcurrency = useAppStore(
    (s) => s.setCoverThumbnailGenerationConcurrency,
  )
  const homeCardStyleLabels = useMemo<Record<HomeCardStyle, string>>(
    () => ({
      adaptive: t("settings.homeCardStyle.adaptive"),
      coverBlur: t("settings.homeCardStyle.coverBlur"),
    }),
    [t],
  )
  const homeCardStyleValue = homeCardStyleLabels[homeCardStyle]
  const homeCardStyleMenuActions = useMemo<ListMenuAction[]>(
    () =>
      (["adaptive", "coverBlur"] as HomeCardStyle[]).map((style) => ({
        id: `homeCardStyle:${style}`,
        title: homeCardStyleLabels[style],
        state: homeCardStyle === style ? "on" : "off",
      })),
    [homeCardStyle, homeCardStyleLabels],
  )

  return (
    <>
      <Screen>
        <View className="gap-3">
          <SectionLabel>{t("settings.resources.title")}</SectionLabel>
          <SectionCard>
            <ListRow
              testID="settings-libraries-row"
              title={t("settings.resources.libraries")}
              icon={SETTINGS_ROW_ICONS.libraries}
              onPress={() => navigateTo("/settings/libraries")}
            />
            <ListRow
              testID="settings-data-sources-row"
              title={t("settings.resources.dataSources")}
              icon={SETTINGS_ROW_ICONS.dataSources}
              isLast
              onPress={() => navigateTo("/settings/data-sources")}
            />
          </SectionCard>
        </View>
        <View className="gap-3">
          <SectionLabel>{t("aiProviders.title")}</SectionLabel>
          <SectionCard>
            <ListRow
              testID="settings-tts-providers-row"
              title={t("ttsSettings.providers")}
              detail={t("aiProviders.ttsDescription")}
              icon={SETTINGS_ROW_ICONS.tts}
              onPress={() => navigateTo("/tts-providers")}
            />
            <ListRow
              testID="settings-llm-providers-row"
              title={t("llm.title")}
              detail={t("aiProviders.llmDescription")}
              icon={SETTINGS_ROW_ICONS.llm}
              onPress={() => navigateTo("/llm-providers")}
              isLast
            />
          </SectionCard>
        </View>
        <View className="gap-3">
          <SectionLabel>{t("settings.tts.sectionTitle")}</SectionLabel>
          <SectionCard>
            <ListRow
              testID="settings-tts-row"
              title={t("ttsSettings.defaults")}
              icon={SETTINGS_ROW_ICONS.tts}
              onPress={() => navigateTo("/settings/tts")}
              isLast
            />
          </SectionCard>
        </View>
        <View className="gap-3">
          <SectionLabel>{t("settings.appearance")}</SectionLabel>
          <SectionCard>
            <ListMenuRow
              actions={languageMenuActions}
              isAnchoredToRight
              onPressAction={({ nativeEvent }) => {
                const lang = nativeEvent.event.replace("lang:", "")
                setLanguage(lang === "system" ? "" : lang)
              }}
              title={t("settings.language")}
              icon={SETTINGS_ROW_ICONS.language}
              value={languageLabels[effectiveLanguage]}
            />
            <ListMenuRow
              actions={themeMenuActions}
              isAnchoredToRight
              onPressAction={({ nativeEvent }) => {
                const nextMode = nativeEvent.event.replace(
                  "theme:",
                  "",
                ) as ThemeMode
                setMode(nextMode)
              }}
              title={t("settings.darkMode")}
              icon={SETTINGS_ROW_ICONS.darkMode}
              value={themeMode}
            />
            <ListMenuRow
              actions={homeCardStyleMenuActions}
              isAnchoredToRight
              onPressAction={({ nativeEvent }) => {
                const nextStyle = nativeEvent.event.replace(
                  "homeCardStyle:",
                  "",
                ) as HomeCardStyle
                setHomeCardStyle(nextStyle)
              }}
              title={t("settings.homeCardStyle")}
              icon={SETTINGS_ROW_ICONS.homeCardStyle}
              value={homeCardStyleValue}
              isLast
            />
          </SectionCard>
        </View>
        <AppUpdateSection />
        {DEVELOPER_TOOLS_ENABLED ? (
          <View className="gap-3">
            <SectionLabel>{t("settings.developer.title")}</SectionLabel>
            <SectionCard>
              <ListRow
                testID="settings-clear-image-cache-row"
                title={t("settings.developer.clearImageCache.title")}
                icon={SETTINGS_ROW_ICONS.clearImageCache}
                detail={t("settings.developer.clearImageCache.detail")}
                onPress={handleClearImageCache}
              />
              <ListRow
                testID="settings-library-performance-profiler-row"
                title={t("settings.developer.libraryPerformanceProfiler.title")}
                icon={SETTINGS_ROW_ICONS.libraryPerformanceProfiler}
                detail={t(
                  "settings.developer.libraryPerformanceProfiler.detail",
                )}
                accessory={
                  <FormFieldSwitch
                    accessibilityLabel={t(
                      "settings.developer.libraryPerformanceProfiler.title",
                    )}
                    testID="settings-library-performance-profiler-switch"
                    value={libraryPerformanceProfilerEnabled}
                    onValueChange={setLibraryPerformanceProfilerEnabled}
                  />
                }
              />
              <ListRow
                testID="settings-cover-loading-animation-row"
                title={t("settings.developer.coverLoadingAnimation.title")}
                icon={SETTINGS_ROW_ICONS.coverLoadingAnimation}
                detail={t("settings.developer.coverLoadingAnimation.detail")}
                accessory={
                  <FormFieldSwitch
                    accessibilityLabel={t(
                      "settings.developer.coverLoadingAnimation.title",
                    )}
                    testID="settings-cover-loading-animation-switch"
                    value={coverLoadingSkeletonPulseEnabled}
                    onValueChange={setCoverLoadingSkeletonPulseEnabled}
                  />
                }
              />
              <ListRow
                testID="settings-cover-thumbnail-concurrency-row"
                title={t("settings.developer.coverThumbnailConcurrency.title")}
                icon={SETTINGS_ROW_ICONS.coverThumbnailConcurrency}
                detail={t(
                  "settings.developer.coverThumbnailConcurrency.detail",
                )}
                accessory={
                  <DeveloperConcurrencyControl
                    testID="settings-cover-thumbnail-concurrency-stepper"
                    value={coverThumbnailGenerationConcurrency}
                    min={COVER_THUMBNAIL_GENERATION_CONCURRENCY_MIN}
                    max={COVER_THUMBNAIL_GENERATION_CONCURRENCY_MAX}
                    decrementLabel={t(
                      "settings.developer.coverThumbnailConcurrency.decrementLabel",
                    )}
                    incrementLabel={t(
                      "settings.developer.coverThumbnailConcurrency.incrementLabel",
                    )}
                    onValueChange={setCoverThumbnailGenerationConcurrency}
                  />
                }
                isLast
              />
            </SectionCard>
          </View>
        ) : null}
        <View className="gap-3">
          <SectionLabel>{t("settings.privacy.title")}</SectionLabel>
          <SectionCard>
            <ListRow
              testID="settings-diagnostics-row"
              title={t("settings.privacy.diagnostics.title")}
              icon={SETTINGS_ROW_ICONS.diagnostics}
              detail={t(
                DIAGNOSTICS_AVAILABLE
                  ? "settings.privacy.diagnostics.detail"
                  : "settings.privacy.diagnostics.unavailable",
              )}
              accessory={
                <FormFieldSwitch
                  accessibilityLabel={t("settings.privacy.diagnostics.title")}
                  disabled={!DIAGNOSTICS_AVAILABLE}
                  testID="settings-diagnostics-switch"
                  value={DIAGNOSTICS_AVAILABLE && diagnosticsEnabled}
                  onValueChange={setDiagnosticsEnabled}
                />
              }
              isLast
            />
          </SectionCard>
        </View>
      </Screen>
    </>
  )
}
