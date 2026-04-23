import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar";
import { useThemePalette } from "@/src/design/tokens";
import { Pressable, Text } from "@/tw";

import { EmptyState, Screen, SectionCard, SettingsRow } from "../components";
import type { WebDavDataSource } from "../data/types";
import { useDataSourceStore } from "../store/data-source-store";
import { useLibraryStore } from "../store/library-store";
import { readWebDavPassword } from "../store/secure-credential-store";
import { createWebDavLibraryFromPath, listWebDavDirectory } from "../data/webdav";

type BrowserEntry = {
  href: string;
  name: string;
  isDirectory: boolean;
};

/**
 * 规范化路由中的目录参数，根目录统一表示为 "/"。
 */
function normalizeCurrentPath(path: string | undefined) {
  const normalized = (path ?? "").trim();
  if (!normalized || normalized === "/") {
    return "/";
  }
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

/**
 * 判断错误是否由目录下缺少 metadata.db 导致。
 */
function isMissingMetadataDbError(error: unknown) {
  return error instanceof Error && /404/.test(error.message);
}

export default function WebDavBrowserScreen() {
  const palette = useThemePalette();
  const { dataSourceId, currentPath: currentPathParam } = useLocalSearchParams<{
    dataSourceId?: string;
    currentPath?: string;
  }>();
  const currentPath = useMemo(() => normalizeCurrentPath(currentPathParam), [currentPathParam]);
  const { dataSources } = useDataSourceStore();
  const { addResolvedLibrary } = useLibraryStore();
  const candidate = useMemo(
    () =>
      dataSources.find(
        (item) => item.id === dataSourceId && item.type === "webdav"
      ) ?? null,
    [dataSourceId, dataSources]
  );
  const [source, setSource] = useState<WebDavDataSource | null>(null);
  const [entries, setEntries] = useState<BrowserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function resolveSource() {
      if (active) {
        setSource(null);
      }
      if (!candidate || candidate.type !== "webdav") {
        return;
      }

      const password = candidate.password ?? (await readWebDavPassword(candidate.id)) ?? "";
      if (!password) {
        if (active) {
          setSource(null);
        }
        return;
      }

      if (active) {
        setSource({ ...candidate, password });
      }
    }

    void resolveSource();
    return () => {
      active = false;
    };
  }, [candidate]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!source) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const items = await listWebDavDirectory(source, currentPath === "/" ? "" : currentPath);
        if (active) {
          setEntries(items.filter((item) => item.isDirectory));
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "无法读取远程目录");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [currentPath, source]);

  async function handleChooseCurrentPath() {
    if (!source) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const library = await createWebDavLibraryFromPath(source, currentPath || "/");
      const added = await addResolvedLibrary(library);
      if (added) {
        router.dismissTo("/settings");
      }
    } catch (caught) {
      if (isMissingMetadataDbError(caught)) {
        showAlertWithStatusBarRestore("目录不可用", "当前目录不是有效书库，未找到 metadata.db。");
        return;
      }
      setError(caught instanceof Error ? caught.message : "当前目录不是有效的 Calibre 书库。");
    } finally {
      setSaving(false);
    }
  }

  /**
   * 进入子目录时入栈一个同路由页面，返回按钮即可回退到父目录。
   */
  function handleOpenDirectory(path: string) {
    if (!source) {
      return;
    }
    router.push({
      pathname: "/settings/webdav/browser",
      params: {
        dataSourceId: source.id,
        currentPath: normalizeCurrentPath(path),
      },
    });
  }

  if (!source) {
    return (
      <Screen>
        <EmptyState title="数据源不存在" detail="请先添加一个 WebDAV 数据源。" />
      </Screen>
    );
  }

  return (
    <Screen>
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            tintColor={palette.primary}
            disabled={saving}
            onPress={() => void handleChooseCurrentPath()}
          >
            <Stack.Toolbar.Icon sf="checkmark" />
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : (
        <Stack.Screen
          options={{
            headerRight: () => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={saving ? "正在验证目录" : "选择当前目录为书库"}
                className="min-h-10 min-w-10 items-center justify-center"
                disabled={saving}
                onPress={() => void handleChooseCurrentPath()}
                style={{ opacity: saving ? 0.45 : 1 }}
              >
                <MaterialIcons name="check" size={22} color={palette.primary} />
              </Pressable>
            ),
          }}
        />
      )}

      <Text className="px-1 text-sm leading-6" style={{ color: palette.textMuted }}>
        当前路径：{currentPath}
      </Text>

      {loading ? (
        <EmptyState title="正在读取目录" detail="正在从 WebDAV 服务器获取目录列表。" />
      ) : error ? (
        <EmptyState title="读取失败" detail={error} />
      ) : entries.length === 0 ? (
        <EmptyState title="当前目录为空" detail="当前目录下没有子目录。" />
      ) : (
        <SectionCard>
          {entries.map((entry, index) => (
            <SettingsRow
              key={entry.href}
              title={entry.name}
              detail={entry.href || "/"}
              onPress={() => handleOpenDirectory(entry.href)}
              isLast={index === entries.length - 1}
            />
          ))}
        </SectionCard>
      )}
    </Screen>
  );
}
