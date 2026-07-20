import { Image as ExpoImage } from "expo-image"
import { getLocales } from "expo-localization"
import type { MenuAction } from "@react-native-menu/menu"
import { router, useNavigation } from "expo-router"
import { useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Switch } from "react-native"

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import {
  COVER_THUMBNAIL_GENERATION_CONCURRENCY_MAX,
  COVER_THUMBNAIL_GENERATION_CONCURRENCY_MIN,
} from "@/src/config/library-list-performance"
import { DEVELOPER_TOOLS_ENABLED } from "@/src/constants/developer-tools"
import { changeLanguage } from "@/src/i18n"
import { clearBookCoverThumbnailCache } from "@/src/repos/book-cover-thumbnail-cache"
import { clearCoverThumbnailCache } from "@/src/services/fs/cover-thumbnail-cache"
import { useTheme, useThemePalette, type ThemeMode } from "@/src/design/tokens"
import type { HomeCardStyle } from "@/src/store/app-store.types"
import { View } from "@/tw"

import {
  Screen,
  SectionCard,
  ListMenuRow,
  ListRow,
  SectionLabel,
} from "@/src/components"
import { useAppStore } from "@/src/store/app-store"
import { DeveloperConcurrencyControl } from "./components/developer-concurrency-control"

export default function SettingsScreen() {
  const { t } = useTranslation()
  const { mode, setMode } = useTheme()
  const palette = useThemePalette()
  const libraries = useAppStore((s) => s.libraries)
  const activeLibraryId = useAppStore((s) => s.activeLibraryId)
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
      showAlertWithStatusBarRestore(
        t("settings.developer.clearImageCache.errorTitle"),
        error instanceof Error
          ? error.message
          : t("settings.developer.clearImageCache.errorDetail"),
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
  const themeMenuActions = useMemo<MenuAction[]>(() => {
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
      title: `${nextMode === themeMode ? "✓ " : ""}${nextMode}`,
    }))
  }, [t, themeMode])

  const language = useAppStore((s) => s.settings.language)
  const setLanguage = useAppStore((s) => s.setLanguage)
  const effectiveLanguage = language || "system"
  const languageLabels = useMemo<Record<string, string>>(
    () => ({
      zh: "中文",
      en: "English",
      system: t("settings.themeMode.system"),
    }),
    [t],
  )
  const languageMenuActions = useMemo<MenuAction[]>(
    () =>
      ["system", "zh", "en"].map((lang) => ({
        id: `lang:${lang}`,
        title: `${effectiveLanguage === lang ? "✓ " : ""}${languageLabels[lang]}`,
      })),
    [effectiveLanguage, languageLabels],
  )

  const homeCardStyle = useAppStore((s) => s.settings.homeCardStyle)
  const setHomeCardStyle = useAppStore((s) => s.setHomeCardStyle)
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
  const homeCardStyleMenuActions = useMemo<MenuAction[]>(
    () =>
      (["adaptive", "coverBlur"] as HomeCardStyle[]).map((style) => ({
        id: `homeCardStyle:${style}`,
        title: `${homeCardStyle === style ? "✓ " : ""}${homeCardStyleLabels[style]}`,
      })),
    [homeCardStyle, homeCardStyleLabels],
  )

  return (
    <>
      <Screen>
        <View className="gap-3">
          <SectionLabel>{t("settings.librarySection")}</SectionLabel>
          <SectionCard>
            {libraries.map((library) => (
              <ListRow
                key={library.id}
                testID={`settings-library-row-${library.id}`}
                title={library.name}
                value={
                  activeLibraryId === library.id
                    ? t("settings.currentInUse")
                    : undefined
                }
                onPress={() =>
                  navigateTo({
                    pathname: "/settings/library/[libraryId]",
                    params: { libraryId: library.id },
                  })
                }
              />
            ))}
            <ListRow
              testID="settings-add-library-row"
              title={t("settings.addLibrary")}
              isLast
              onPress={() => navigateTo("/settings/add-library")}
            />
          </SectionCard>
        </View>
        <View className="gap-3">
          <SectionLabel>{t("settings.remoteDataSources")}</SectionLabel>
          <SectionCard>
            <ListRow
              testID="settings-webdav-row"
              title="WebDAV"
              detail={t("settings.webdavDetail")}
              onPress={() => navigateTo("/settings/webdav")}
            />
            <ListRow
              testID="settings-onedrive-row"
              title="OneDrive"
              detail={t("settings.onedriveDetail")}
              onPress={() => navigateTo("/settings/onedrive")}
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
                void changeLanguage(
                  lang === "system"
                    ? (getLocales()[0]?.languageCode ?? "zh")
                    : lang,
                )
              }}
              title={t("settings.language")}
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
              value={homeCardStyleValue}
              isLast
            />
          </SectionCard>
        </View>
        {DEVELOPER_TOOLS_ENABLED ? (
          <View className="gap-3">
            <SectionLabel>{t("settings.developer.title")}</SectionLabel>
            <SectionCard>
              <ListRow
                testID="settings-clear-image-cache-row"
                title={t("settings.developer.clearImageCache.title")}
                detail={t("settings.developer.clearImageCache.detail")}
                onPress={handleClearImageCache}
              />
              <ListRow
                testID="settings-library-performance-profiler-row"
                title={t("settings.developer.libraryPerformanceProfiler.title")}
                detail={t(
                  "settings.developer.libraryPerformanceProfiler.detail",
                )}
                accessory={
                  <Switch
                    accessibilityLabel={t(
                      "settings.developer.libraryPerformanceProfiler.title",
                    )}
                    testID="settings-library-performance-profiler-switch"
                    value={libraryPerformanceProfilerEnabled}
                    onValueChange={setLibraryPerformanceProfilerEnabled}
                    trackColor={{
                      false: palette.border,
                      true: palette.primary,
                    }}
                    thumbColor={palette.surface}
                    ios_backgroundColor={palette.backgroundSecondary}
                  />
                }
              />
              <ListRow
                testID="settings-cover-loading-animation-row"
                title={t("settings.developer.coverLoadingAnimation.title")}
                detail={t("settings.developer.coverLoadingAnimation.detail")}
                accessory={
                  <Switch
                    accessibilityLabel={t(
                      "settings.developer.coverLoadingAnimation.title",
                    )}
                    testID="settings-cover-loading-animation-switch"
                    value={coverLoadingSkeletonPulseEnabled}
                    onValueChange={setCoverLoadingSkeletonPulseEnabled}
                    trackColor={{
                      false: palette.border,
                      true: palette.primary,
                    }}
                    thumbColor={palette.surface}
                    ios_backgroundColor={palette.backgroundSecondary}
                  />
                }
              />
              <ListRow
                testID="settings-cover-thumbnail-concurrency-row"
                title={t("settings.developer.coverThumbnailConcurrency.title")}
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
      </Screen>
    </>
  )
}
