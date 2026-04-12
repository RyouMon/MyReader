import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";

import { useThemePalette } from "@/src/design/tokens";
import { Pressable, Text } from "@/tw";

import { EmptyState, Screen, SectionCard, SettingsRow } from "../components";
import type { WebDavDataSource } from "../data/types";
import { useDataSourceStore } from "../store/data-source-store";
import { useLibraryStore } from "../store/library-store";
import { createWebDavLibraryFromPath, listWebDavDirectory } from "../data/webdav";

type BrowserEntry = {
  href: string;
  name: string;
  isDirectory: boolean;
};

export default function WebDavBrowserScreen() {
  const palette = useThemePalette();
  const { dataSourceId } = useLocalSearchParams<{ dataSourceId?: string }>();
  const { dataSources } = useDataSourceStore();
  const { addResolvedLibrary } = useLibraryStore();
  const source = useMemo<WebDavDataSource | null>(() => {
    const candidate = dataSources.find(
      (item) => item.id === dataSourceId && item.type === "webdav"
    );

    return candidate?.type === "webdav" ? candidate : null;
  }, [dataSourceId, dataSources]);
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<BrowserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!source) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const items = await listWebDavDirectory(source, currentPath);
        if (active) {
          setEntries(items);
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
      setError(caught instanceof Error ? caught.message : "当前目录不是有效的 Calibre 书库。");
    } finally {
      setSaving(false);
    }
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
      <Text className="px-1 text-sm leading-6" style={{ color: palette.textMuted }}>
        当前路径：{currentPath || "/"}
      </Text>

      <Pressable
        accessibilityRole="button"
        className="min-h-12 items-center justify-center rounded-full px-4"
        onPress={() => void handleChooseCurrentPath()}
        style={{ backgroundColor: palette.primary }}
      >
        <Text className="text-[15px]" style={{ color: palette.primaryForeground, fontWeight: "700" }}>
          {saving ? "验证中..." : "选择当前目录为书库"}
        </Text>
      </Pressable>

      {currentPath ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-12 items-center justify-center rounded-full px-4"
          onPress={() => setCurrentPath(currentPath.split("/").slice(0, -1).join("/") || "")}
          style={{ backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }}
        >
          <Text className="text-[15px]" style={{ color: palette.text, fontWeight: "700" }}>
            返回上级目录
          </Text>
        </Pressable>
      ) : null}

      {loading ? (
        <EmptyState title="正在读取目录" detail="正在从 WebDAV 服务器获取目录列表。" />
      ) : error ? (
        <EmptyState title="读取失败" detail={error} />
      ) : entries.length === 0 ? (
        <EmptyState title="当前目录为空" detail="当前目录下没有文件或子目录。" />
      ) : (
        <SectionCard>
          {entries.map((entry, index) => (
            <SettingsRow
              key={entry.href}
              title={entry.name}
              detail={entry.isDirectory ? entry.href || "/" : `文件 · ${entry.href}`}
              onPress={entry.isDirectory ? () => setCurrentPath(entry.href) : undefined}
              isLast={index === entries.length - 1}
            />
          ))}
        </SectionCard>
      )}
    </Screen>
  );
}
