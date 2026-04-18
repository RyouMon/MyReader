import { Link } from "expo-router";
import { useMemo, useState } from "react";

import {
  clearAllReaderCaches,
  enforceReaderCacheLimit,
  getReaderCacheUsageSummary,
} from "@/src/data/cache";
import { useTheme, useThemePalette, type ThemeMode } from "@/src/design/tokens";
import { Text, View } from "@/tw";

import { Screen, SectionCard, SectionHeading, SettingsRow, Sheet, SheetOption } from "../components";
import { useAppStore } from "../store/app-store";
import { useLibraryStore } from "../store/library-store";

const themeModes = ["跟随设备", "浅色", "深色"];
const themeModeMap: Record<string, ThemeMode> = { 跟随设备: "system", 浅色: "light", 深色: "dark" };
const themeModeLabels: Record<ThemeMode, string> = { system: "跟随设备", light: "浅色", dark: "深色" };

export default function SettingsScreen() {
  const palette = useThemePalette();
  const { mode, setMode } = useTheme();
  const { libraries, activeLibraryId } = useLibraryStore();
  const cacheSettings = useAppStore((s) => s.settings.cache);
  const patchCacheSettings = useAppStore((s) => s.patchCacheSettings);
  const [themeSheetOpen, setThemeSheetOpen] = useState(false);
  const [cacheLimitSheetOpen, setCacheLimitSheetOpen] = useState(false);
  const [cacheUsageLabel, setCacheUsageLabel] = useState(() => {
    const usage = getReaderCacheUsageSummary();
    return `${(usage.totalBytes / 1024 / 1024).toFixed(1)} MB`;
  });
  const themeMode = useMemo(() => themeModeLabels[mode], [mode]);

  return (
    <>
      <Screen>
        <View className="gap-3">
          <SectionHeading title="书库" />
          <SectionCard>
            {libraries.map((library) => (
              <Link
                key={library.id}
                href={{ pathname: "/settings/library/[libraryId]", params: { libraryId: library.id } }}
                asChild
              >
                <SettingsRow
                  title={library.name}
                  detail={`${library.bookCount} 本${activeLibraryId === library.id ? " · 当前使用" : ""}`}
                />
              </Link>
            ))}
            <Link href="/settings/add-library" asChild>
              <SettingsRow title="添加书库" isLast />
            </Link>
          </SectionCard>
        </View>
        <View className="gap-3">
          <SectionHeading title="阅读偏好" />
          <SectionCard>
            <SettingsRow title="深色模式" detail={themeMode} onPress={() => setThemeSheetOpen(true)} />
            <SettingsRow title="同步阅读进度" detail="在已连接设备间保留最近位置" />
            <SettingsRow title="阅读器样式" detail="字体、字号、页边距" />
            <SettingsRow
              title="缓存最大容量"
              detail={`${cacheSettings.maxCacheSizeMB} MB`}
              onPress={() => setCacheLimitSheetOpen(true)}
            />
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
        <View className="gap-3">
          <SectionHeading title="数据与来源" />
          <SectionCard>
            <SettingsRow title="本地存储" detail="默认数据源，无需配置" />
            <Link href="/settings/webdav-sources" asChild>
              <SettingsRow title="WebDAV" detail="可添加并管理远程 WebDAV 数据源" isLast />
            </Link>
          </SectionCard>
        </View>
      </Screen>
      <Sheet open={themeSheetOpen} onClose={() => setThemeSheetOpen(false)}>
        <View className="gap-2">
          <Text className="px-1 text-xs font-semibold uppercase tracking-[0.4px]" style={{ color: palette.textMuted }}>
            深色模式
          </Text>
          <View className="gap-1">
            {themeModes.map((nextMode) => (
              <SheetOption
                key={nextMode}
                label={nextMode}
                active={nextMode === themeMode}
                onPress={() => {
                  setMode(themeModeMap[nextMode]);
                  setThemeSheetOpen(false);
                }}
              />
            ))}
          </View>
        </View>
      </Sheet>
      <Sheet open={cacheLimitSheetOpen} onClose={() => setCacheLimitSheetOpen(false)}>
        <View className="gap-2">
          <Text className="px-1 text-xs font-semibold uppercase tracking-[0.4px]" style={{ color: palette.textMuted }}>
            缓存最大容量
          </Text>
          <View className="gap-1">
            {[512, 1024, 2048, 4096, 8192].map((size) => (
              <SheetOption
                key={size}
                label={`${size} MB`}
                active={cacheSettings.maxCacheSizeMB === size}
                onPress={() => {
                  patchCacheSettings({ maxCacheSizeMB: size });
                  enforceReaderCacheLimit(size);
                  const usage = getReaderCacheUsageSummary();
                  setCacheUsageLabel(`${(usage.totalBytes / 1024 / 1024).toFixed(1)} MB`);
                  setCacheLimitSheetOpen(false);
                }}
              />
            ))}
          </View>
        </View>
      </Sheet>
    </>
  );
}
