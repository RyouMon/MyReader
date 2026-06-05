import { normalizeCurrentPath } from "@/src/domain/library/remote-library";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useThemePalette } from "@/src/design/tokens";
import { Text } from "@/tw";

import { EmptyState, Screen, SectionCard, SettingsRow } from "@/src/components";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { HeaderToolbar } from "@/src/components/ui/header-toolbar";
import type { RemoteLibraryOps } from "@/src/domain/library/remote-library";
import { createLibraryFromPath } from "@/src/domain/library/remote-library-shared";
import type { DataSource, Library } from "@/src/domain/types";
import { useRemoteDirectoryBrowser } from "@/src/features/settings/hooks/use-remote-directory-browser";
import { createRemoteBackend } from "@/src/services/remote/factory";

const resolveOneDriveOps = async (candidate: DataSource) => {
  if (candidate.type !== "onedrive") return null;
  try {
    const placeholderLib: Library = {
      id: "browse",
      name: "",
      path: "",
      bookCount: 0,
      dataSourceId: candidate.id,
      sourceType: "onedrive",
    };
    const backend = await createRemoteBackend(candidate, placeholderLib);
    if (!backend) return null;

    const ops: RemoteLibraryOps = {
      testConnection: async () => {
        const headers = await backend.getAuthHeaders();
        return fetch("https://graph.microsoft.com/v1.0/me/drive", { method: "GET", headers });
      },
      listDirectory: (path: string) => backend.listDirectory(path),
      createLibraryFromPath: (remotePath: string) => createLibraryFromPath(backend, candidate.id, candidate.name, remotePath),
      readBooks: async () => ({ books: [], metadataUri: "" }),
      buildCoverUri: async () => undefined,
      forceRefreshMetadata: async () => {
        throw new Error("forceRefreshMetadata unavailable in OneDrive browser");
      },
    };
    return ops;
  } catch {
    return null;
  }
};

export default function OneDriveBrowserScreen() {
  const { t } = useTranslation();
  const palette = useThemePalette();
  const { dataSourceId, currentPath: currentPathParam } = useLocalSearchParams<{
    dataSourceId?: string;
    currentPath?: string;
  }>();

  const resolveOps = useCallback(resolveOneDriveOps, []);

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
    sourceType: "onedrive",
    resolveOps,
  });

  function handleOpenDirectory(path: string) {
    if (!candidateId) return;
    router.push({
      pathname: "/settings/onedrive/browser",
      params: { dataSourceId: candidateId, currentPath: normalizeCurrentPath(path) },
    });
  }

  if (notFound) {
    return (
      <Screen>
        <EmptyState title={t("onedrive.browser.notFound.title")} detail={t("onedrive.browser.notFound.detail")} icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ErrorBoundary
        title={t("onedrive.browser.loadFailed.title")}
        message={t("onedrive.browser.loadFailed.message")}
        onRetry={() => { /* effect re-triggers via loading/error state */ }}
      >
        <HeaderToolbar
          right={[
            {
              label: saving ? t("onedrive.browser.validating") : t("onedrive.browser.selectDirectory"),
              onPress: () => void chooseCurrentPath({
                notValidTitle: t("onedrive.browser.notValidLibrary.title"),
                notValidMessage: t("onedrive.browser.notValidLibrary.message"),
                generic: t("onedrive.browser.notCalibreLibrary"),
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
          {t("onedrive.browser.currentPath", { path: currentPath })}
        </Text>

        {loading ? (
          <EmptyState title={t("onedrive.browser.reading.title")} detail={t("onedrive.browser.reading.detail")} icon={{ ios: "hourglass", android: "hourglass-empty" }} />
        ) : resolveFailed ? (
          <EmptyState title={t("onedrive.browser.readFailed.title")} detail={t("onedrive.browser.noCredentials")} icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }} />
        ) : error ? (
          <EmptyState title={t("onedrive.browser.readFailed.title")} detail={error} icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }} />
        ) : entries.length === 0 ? (
          <EmptyState title={t("onedrive.browser.empty.title")} detail={t("onedrive.browser.empty.detail")} icon={{ ios: "folder", android: "folder-open" }} />
        ) : (
          <SectionCard>
            {entries.map((entry, index) => (
              <SettingsRow
                key={entry.path}
                title={entry.name}
                icon={{ ios: "folder.fill", android: "folder" }}
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