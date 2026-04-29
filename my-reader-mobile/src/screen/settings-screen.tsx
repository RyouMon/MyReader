import { MenuView, type MenuAction } from "@react-native-menu/menu";
import { router, useNavigation } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  clearAllReaderCaches,
  enforceReaderCacheLimit,
  getReaderCacheUsageSummary,
} from "@/src/data/cache";
import { useTheme, type ThemeMode } from "@/src/design/tokens";
import { View } from "@/tw";

import { Screen, SectionCard, SectionHeading, SettingsRow } from "../components";
import { useAppStore } from "../store/app-store";
import { useLibraryStore } from "../store/library-store";

const themeModes = ["跟随设备", "浅色", "深色"];
const themeModeMap: Record<string, ThemeMode> = { 跟随设备: "system", 浅色: "light", 深色: "dark" };
const themeModeLabels: Record<ThemeMode, string> = { system: "跟随设备", light: "浅色", dark: "深色" };

export default function SettingsScreen() {
  const { mode, setMode } = useTheme();
  const { libraries, activeLibraryId } = useLibraryStore();
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
  const cacheSettings = useAppStore((s) => s.settings.cache);
  const patchCacheSettings = useAppStore((s) => s.patchCacheSettings);
  const [cacheUsageLabel, setCacheUsageLabel] = useState(() => {
    const usage = getReaderCacheUsageSummary();
    return `${(usage.totalBytes / 1024 / 1024).toFixed(1)} MB`;
  });
  const themeMode = useMemo(() => themeModeLabels[mode], [mode]);
  const themeMenuActions = useMemo<MenuAction[]>(
    () =>
      themeModes.map((nextMode) => ({
        id: `theme:${themeModeMap[nextMode]}`,
        title: `${nextMode === themeMode ? "✓ " : ""}${nextMode}`,
      })),
    [themeMode]
  );
  const cacheLimitMenuActions = useMemo<MenuAction[]>(
    () =>
      [512, 1024, 2048, 4096, 8192].map((size) => ({
        id: `cache:${size}`,
        title: `${cacheSettings.maxCacheSizeMB === size ? "✓ " : ""}${size} MB`,
      })),
    [cacheSettings.maxCacheSizeMB]
  );

  return (
    <>
      <Screen>
        <View className="gap-3">
          <SectionHeading title="书库" />
          <SectionCard>
            {libraries.map((library) => (
              <SettingsRow
                key={library.id}
                title={library.name}
                detail={`${library.bookCount} 本${activeLibraryId === library.id ? " · 当前使用" : ""}`}
                onPress={() =>
                  navigateTo({
                    pathname: "/settings/library/[libraryId]",
                    params: { libraryId: library.id },
                  })
                }
              />
            ))}
            <SettingsRow
              title="添加书库"
              isLast
              onPress={() => navigateTo("/settings/add-library")}
            />
          </SectionCard>
        </View>
        <View className="gap-3">
          <SectionHeading title="数据与来源" />
          <SectionCard>
            <SettingsRow title="本地存储" detail="默认数据源，无需配置" />
            <SettingsRow
              title="WebDAV"
              detail="可添加并管理远程 WebDAV 数据源"
              onPress={() => navigateTo("/settings/webdav")}
            />
          </SectionCard>
        </View>
        <View className="gap-3">
          <SectionHeading title="阅读偏好" />
          <SectionCard>
            <MenuView
              actions={themeMenuActions}
              isAnchoredToRight
              onPressAction={({ nativeEvent }) => {
                const nextMode = nativeEvent.event.replace("theme:", "") as ThemeMode;
                setMode(nextMode);
              }}
            >
              <SettingsRow title="深色模式" detail={themeMode} />
            </MenuView>
            <SettingsRow title="阅读器样式" detail="字体、字号、页边距" />
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
              <SettingsRow title="缓存最大容量" detail={`${cacheSettings.maxCacheSizeMB} MB`} />
            </MenuView>
            <SettingsRow
              title="全部清理缓存"
              detail={`当前占用 ${cacheUsageLabel}`}
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
