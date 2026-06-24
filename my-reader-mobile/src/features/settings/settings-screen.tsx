import { getLocales } from "expo-localization";
import type { MenuAction } from "@react-native-menu/menu";
import { router, useNavigation } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { changeLanguage } from "@/src/i18n";
import { useTheme, type ThemeMode } from "@/src/design/tokens";
import { View } from "@/tw";

import { Screen, SectionCard, ListMenuRow, ListRow, SectionLabel } from "@/src/components";
import { useAppStore } from "@/src/store/app-store";

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { mode, setMode } = useTheme();
  const libraries = useAppStore((s) => s.libraries);
  const activeLibraryId = useAppStore((s) => s.activeLibraryId);
  const navigation = useNavigation();
  const isTransitioningRef = useRef(false);

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

  const themeModeLabels: Record<ThemeMode, string> = useMemo(() => ({
    system: t("settings.themeMode.system"),
    light: t("settings.themeMode.light"),
    dark: t("settings.themeMode.dark"),
  }), [t]);
  const themeMode = themeModeLabels[mode];
  const themeMenuActions = useMemo<MenuAction[]>(
    () => {
      const themeModes = [t("settings.themeMode.system"), t("settings.themeMode.light"), t("settings.themeMode.dark")];
      const themeModeMap: Record<string, ThemeMode> = {
        [t("settings.themeMode.system")]: "system",
        [t("settings.themeMode.light")]: "light",
        [t("settings.themeMode.dark")]: "dark",
      };
      return themeModes.map((nextMode) => ({
        id: `theme:${themeModeMap[nextMode]}`,
        title: `${nextMode === themeMode ? "✓ " : ""}${nextMode}`,
      }));
    },
    [t, themeMode]
  );

  const language = useAppStore((s) => s.settings.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const effectiveLanguage = language || "system";
  const languageLabels = useMemo<Record<string, string>>(
    () => ({ zh: "中文", en: "English", system: t("settings.themeMode.system") }),
    [t]
  );
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
          <SectionLabel>{t("settings.librarySection")}</SectionLabel>
          <SectionCard>
            {libraries.map((library) => (
              <ListRow
                key={library.id}
                testID={`settings-library-row-${library.id}`}
                title={library.name}
                value={activeLibraryId === library.id ? t("settings.currentInUse") : undefined}
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
                const lang = nativeEvent.event.replace("lang:", "");
                setLanguage(lang === "system" ? "" : lang);
                changeLanguage(lang === "system" ? (getLocales()[0]?.languageCode ?? "zh") : lang);
              }}
              title={t("settings.language")}
              value={languageLabels[effectiveLanguage]}
            />
            <ListMenuRow
              actions={themeMenuActions}
              isAnchoredToRight
              onPressAction={({ nativeEvent }) => {
                const nextMode = nativeEvent.event.replace("theme:", "") as ThemeMode;
                setMode(nextMode);
              }}
              title={t("settings.darkMode")}
              value={themeMode}
              isLast
            />
          </SectionCard>
        </View>
      </Screen>
    </>
  );
}
