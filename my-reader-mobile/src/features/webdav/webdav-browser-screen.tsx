import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { normalizeCurrentPath } from "@/src/data/remote-library";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useThemePalette } from "@/src/design/tokens";
import { Text } from "@/tw";

import { EmptyState, Screen, SectionCard, SettingsRow } from "@/src/components";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { HeaderToolbar } from "@/src/components/ui/header-toolbar";
import { createRemoteBackend } from "@/src/services/remote/factory";
import { createLibraryFromPath } from "@/src/data/remote-library-shared";
import type { DataSource, Library } from "@/src/data/types";
import type { RemoteLibraryOps } from "@/src/data/remote-library";
import { useRemoteDirectoryBrowser } from "@/src/hooks/use-remote-directory-browser";
import { readWebDavPassword } from "@/src/services/storage/credentials";

const resolveWebDavOps = async (candidate: DataSource) => {
  if (candidate.type !== "webdav") return null;
  const password = (await readWebDavPassword(candidate.id)) ?? "";
  if (!password) return null;

  const placeholderLib: Library = {
    id: "browse",
    name: "",
    path: "",
    bookCount: 0,
    dataSourceId: candidate.id,
    sourceType: "webdav",
  };
  const backend = await createRemoteBackend(candidate, placeholderLib);
  if (!backend) return null;

  const ops: RemoteLibraryOps = {
    testConnection: async () => {
      const headers = await backend.getAuthHeaders();
      return fetch(backend.contentUrl(""), { method: "PROPFIND", headers: { ...headers, Depth: "0" } });
    },
    listDirectory: (path: string) => backend.listDirectory(path),
    createLibraryFromPath: (remotePath: string) => createLibraryFromPath(backend, candidate.id, candidate.name, remotePath),
    readBooks: async () => ({ books: [], metadataUri: "" }),
    buildCoverUri: async () => undefined,
    forceRefreshMetadata: async () => null,
  };
  return ops;
};

export default function WebDavBrowserScreen() {
  const { t } = useTranslation();
  const palette = useThemePalette();
  const { dataSourceId, currentPath: currentPathParam } = useLocalSearchParams<{
    dataSourceId?: string;
    currentPath?: string;
  }>();

  const resolveOps = useCallback(resolveWebDavOps, []);

  const {
    notFound,
    resolveFailed,
    candidateId,
    entries,
    loading,
    error,
    saving,
    currentPath,
    chooseCurrentPath,
  } = useRemoteDirectoryBrowser({
    dataSourceId,
    currentPathParam,
    sourceType: "webdav",
    resolveOps,
  });

  function handleOpenDirectory(path: string) {
    if (!candidateId) return;
    router.push({
      pathname: "/settings/webdav/browser",
      params: { dataSourceId: candidateId, currentPath: normalizeCurrentPath(path) },
    });
  }

  if (notFound) {
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
        onRetry={() => { /* effect re-triggers via loading/error state */ }}
      >
        <HeaderToolbar
          right={[
            {
              label: saving ? t("webdav.browser.validating") : t("webdav.browser.selectDirectory"),
              onPress: () => void chooseCurrentPath({
                notValidTitle: t("webdav.browser.notValidLibrary.title"),
                notValidMessage: t("webdav.browser.notValidLibrary.message"),
                generic: t("webdav.browser.notCalibreLibrary"),
              }),
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
        ) : resolveFailed ? (
          <EmptyState title={t("webdav.browser.readFailed.title")} detail={t("webdav.browser.noCredentials")} icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }} />
        ) : error ? (
          <EmptyState title={t("webdav.browser.readFailed.title")} detail={error} icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }} />
        ) : entries.length === 0 ? (
          <EmptyState title={t("webdav.browser.empty.title")} detail={t("webdav.browser.empty.detail")} icon={{ ios: "folder", android: "folder-open" }} />
        ) : (
          <SectionCard>
            {entries.map((entry, index) => (
              <SettingsRow
                key={entry.path}
                title={entry.name}
                detail={entry.path || "/"}
                onPress={() => handleOpenDirectory(entry.path)}
                isLast={index === entries.length - 1}
              />
            ))}
          </SectionCard>
        )}
      </ErrorBoundary>
    </Screen>
  );
}