import { getLocales } from "expo-localization";
import { MenuView, type MenuAction } from "@react-native-menu/menu";
import { router, useNavigation } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  clearAllReaderCaches,
  enforceReaderCacheLimit,
  getReaderCacheUsageSummary,
} from "@/src/services/fs/cache";
import { changeLanguage } from "@/src/i18n";
import { useTheme, type ThemeMode } from "@/src/design/tokens";
import { View } from "@/tw";

import { Screen, SectionCard, SectionHeading, SettingsRow } from "@/src/components";
import { useAppStore } from "@/src/store/app-store";

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { mode, setMode } = useTheme();
  const libraries = useAppStore((s) => s.libraries);
  const activeLibraryId = useAppStore((s) => s.activeLibraryId);
  const navigation = useNavigation();
  const isTransitioningRef = useRef(false);

  const themeModes = [t("settings.themeMode.system"), t("settings.themeMode.light"), t("settings.themeMode.dark")];
  const themeModeMap: Record<string, ThemeMode> = {
    [t("settings.themeMode.system")]: "system",
    [t("settings.themeMode.light")]: "light",
    [t("settings.themeMode.dark")]: "dark",
  };
  const themeModeLabels: Record<ThemeMode, string> = {
    system: t("settings.themeMode.system"),
    light: t("settings.themeMode.light"),
    dark: t("settings.themeMode.dark"),
  };

  useEffect(() => {
    // transitionStart/transitionEnd are Stack-specific events; the generic
    // useNavigation() type doesn't expose them but they exist at runtime.
    const nav = navigation as unknown as {
      addListener: (event: "transitionStart" | "transitionEnd", cb: () => void) => () => void;
    };
    const unsubStart = nav.addListener("transitionStart", () => {
      isTransitioningRef.current = true;
    });
    const unsubEnd = nav.addListener("transitionEnd", () => {
      isTransitioningRef.current = false;
    });
    return () => {
      unsubStart();
      unsubEnd();
    };
  }, [navigation]);

  function navigateTo(href: Parameters<typeof router.push>[0]) {
    if (isTransitioningRef.current) return;
    router.push(href);
  }
  const cacheSettings = useAppStore((s) => s.settings.cache);
  const patchCacheSettings = useAppStore((s) => s.patchCacheSettings);
  const [cacheUsageLabel, setCacheUsageLabel] = useState(() => {
    const usage = getReaderCacheUsageSummary();
    return `${(usage.totalBytes / 1024 / 1024).toFixed(1)} MB`;
  });
  const themeMode = useMemo(() => themeModeLabels[mode], [mode, themeModeLabels]);
  const themeMenuActions = useMemo<MenuAction[]>(
    () =>
      themeModes.map((nextMode) => ({
        id: `theme:${themeModeMap[nextMode]}`,
        title: `${nextMode === themeMode ? "✓ " : ""}${nextMode}`,
      })),
    [themeModes, themeMode, themeModeMap]
  );
  const cacheLimitMenuActions = useMemo<MenuAction[]>(
    () =>
      [512, 1024, 2048, 4096, 8192].map((size) => ({
        id: `cache:${size}`,
        title: `${cacheSettings.maxCacheSizeMB === size ? "✓ " : ""}${size} MB`,
      })),
    [cacheSettings.maxCacheSizeMB]
  );

  const language = useAppStore((s) => s.settings.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const languageLabels: Record<string, string> = { zh: "中文", en: "English", system: t("settings.themeMode.system") };
  const effectiveLanguage = language || "system";
  const languageMenuActions = useMemo<MenuAction[]>(
    () =>
      ["system", "zh", "en"].map((lang) => ({
        id: `lang:${lang}`,
        title: `${effectiveLanguage === lang ? "✓ " : ""}${languageLabels[lang]}`,
      })),
    [effectiveLanguage, languageLabels]
  );

  return (
    <>
      <Screen>
        <View className="gap-3">
          <SectionHeading title={t("settings.librarySection")} />
          <SectionCard>
            {libraries.map((library) => (
              <SettingsRow
                key={library.id}
                title={library.name}
                detail={
                  activeLibraryId === library.id
                    ? t("settings.bookCountCurrent", { count: library.bookCount })
                    : t("settings.bookCount", { count: library.bookCount })
                }
                onPress={() =>
                  navigateTo({
                    pathname: "/settings/library/[libraryId]",
                    params: { libraryId: library.id },
                  })
                }
              />
            ))}
            <SettingsRow
              title={t("settings.addLibrary")}
              isLast
              onPress={() => navigateTo("/settings/add-library")}
            />
          </SectionCard>
        </View>
        <View className="gap-3">
          <SectionHeading title={t("settings.dataAndSources")} />
          <SectionCard>
            <SettingsRow title={t("settings.localStorage")} detail={t("settings.localStorageDetail")} />
            <SettingsRow
              title="WebDAV"
              detail={t("settings.webdavDetail")}
              onPress={() => navigateTo("/settings/webdav")}
            />
            <SettingsRow
              title="OneDrive"
              detail={t("settings.onedriveDetail")}
              onPress={() => navigateTo("/settings/onedrive")}
              isLast
            />
          </SectionCard>
        </View>
        <View className="gap-3">
          <SectionHeading title={t("settings.readingPreferences")} />
          <SectionCard>
            <MenuView
              actions={languageMenuActions}
              isAnchoredToRight
              onPressAction={({ nativeEvent }) => {
                const lang = nativeEvent.event.replace("lang:", "");
                setLanguage(lang === "system" ? "" : lang);
                changeLanguage(lang === "system" ? (getLocales()[0]?.languageCode ?? "zh") : lang);
              }}
            >
              <SettingsRow title={t("settings.language")} detail={languageLabels[effectiveLanguage]} />
            </MenuView>
            <MenuView
              actions={themeMenuActions}
              isAnchoredToRight
              onPressAction={({ nativeEvent }) => {
                const nextMode = nativeEvent.event.replace("theme:", "") as ThemeMode;
                setMode(nextMode);
              }}
            >
              <SettingsRow title={t("settings.darkMode")} detail={themeMode} />
            </MenuView>
            <SettingsRow title={t("settings.readerStyle")} detail={t("settings.readerStyleDetail")} />
            <MenuView
              actions={cacheLimitMenuActions}
              isAnchoredToRight
              onPressAction={({ nativeEvent }) => {
                const size = Number(nativeEvent.event.replace("cache:", ""));
                if (!Number.isFinite(size)) return;
                patchCacheSettings({ maxCacheSizeMB: size });
                enforceReaderCacheLimit(size);
                const usage = getReaderCacheUsageSummary();
                setCacheUsageLabel(`${(usage.totalBytes / 1024 / 1024).toFixed(1)} MB`);
              }}
            >
              <SettingsRow title={t("settings.cacheMaxSize")} detail={`${cacheSettings.maxCacheSizeMB} MB`} />
            </MenuView>
            <SettingsRow
              title={t("settings.clearAllCache")}
              detail={t("settings.currentUsage", { size: cacheUsageLabel })}
              onPress={() => {
                clearAllReaderCaches();
                const usage = getReaderCacheUsageSummary();
                setCacheUsageLabel(`${(usage.totalBytes / 1024 / 1024).toFixed(1)} MB`);
              }}
              isLast
            />
          </SectionCard>
        </View>
      </Screen>
    </>
  );
}
