import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar";
import { useThemePalette } from "@/src/design/tokens";
import { Text } from "@/tw";

import { EmptyState, Screen, SectionCard, SettingsRow } from "@/src/components";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { HeaderToolbar } from "@/src/components/ui/header-toolbar";
import type { WebDavDataSource } from "@/src/data/types";
import { createWebDavLibraryFromPath, listWebDavDirectory } from "@/src/data/webdav";
import { useDataSourceStore } from "@/src/store/data-source-store";
import { useLibraryStore } from "@/src/store/library-store";
import { readWebDavPassword } from "@/src/store/secure-credential-store";

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
  const { t } = useTranslation();
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
          setError(caught instanceof Error ? caught.message : t("webdav.browser.cannotReadRemote"));
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
  }, [currentPath, source, t]);

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
        showAlertWithStatusBarRestore(t("webdav.browser.notValidLibrary.title"), t("webdav.browser.notValidLibrary.message"));
        return;
      }
      setError(caught instanceof Error ? caught.message : t("webdav.browser.notCalibreLibrary"));
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
        <EmptyState title={t("webdav.browser.notFound.title")} detail={t("webdav.browser.notFound.detail")} icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ErrorBoundary
        title={t("webdav.browser.loadFailed.title")}
        message={t("webdav.browser.loadFailed.message")}
        onRetry={() => {
          setLoading(true);
          setError(null);
        }}
      >
        <HeaderToolbar
          right={[
            {
              label: saving ? t("webdav.browser.validating") : t("webdav.browser.selectDirectory"),
              onPress: () => void handleChooseCurrentPath(),
              icon: <MaterialIcons name="check" size={22} color={palette.primary} />,
              iosSfSymbol: "checkmark",
              color: palette.primary,
              iconOnly: true,
              loading: saving,
              disabled: saving,
              variant: "prominent",
            },
          ]}
        />

        <Text className="px-1 text-sm leading-6" style={{ color: palette.textMuted }}>
          {t("webdav.browser.currentPath", { path: currentPath })}
        </Text>

        {loading ? (
          <EmptyState title={t("webdav.browser.reading.title")} detail={t("webdav.browser.reading.detail")} icon={{ ios: "hourglass", android: "hourglass-empty" }} />
        ) : error ? (
          <EmptyState title={t("webdav.browser.readFailed.title")} detail={error} icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }} />
        ) : entries.length === 0 ? (
          <EmptyState title={t("webdav.browser.empty.title")} detail={t("webdav.browser.empty.detail")} icon={{ ios: "folder", android: "folder-open" }} />
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
      </ErrorBoundary>
    </Screen>
  );
}
