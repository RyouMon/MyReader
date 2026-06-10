import { normalizeCurrentPath } from "@/src/domain/library/remote-library";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { useThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

import { EmptyState, Screen, SectionCard, SettingsRow } from "@/src/components";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header";
import { createSaveAction } from "@/src/navigation/toolbar-action-helpers";
import { useRemoteDirectoryBrowser } from "@/src/features/settings/hooks/use-remote-directory-browser";

type RemoteDirectoryBrowserScreenProps = {
  sourceType: "webdav" | "onedrive";
  browserRoute: "/settings/webdav/browser" | "/settings/onedrive/browser";
  translationNamespace: "webdav.browser" | "onedrive.browser";
};

/** Shared directory browser for remote data sources (WebDAV, OneDrive). */
export function RemoteDirectoryBrowserScreen({
  sourceType,
  browserRoute,
  translationNamespace,
}: RemoteDirectoryBrowserScreenProps) {
  const { t } = useTranslation();
  const palette = useThemePalette();
  const { dataSourceId, currentPath: currentPathParam, from } = useLocalSearchParams<{
    dataSourceId?: string;
    currentPath?: string;
    from?: string;
  }>();

  const label = (key: string, options?: Record<string, unknown>) =>
    t(`${translationNamespace}.${key}`, options);

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
    sourceType,
  });

  function handleOpenDirectory(path: string) {
    if (!candidateId) return;
    router.push({
      pathname: browserRoute,
      params: {
        dataSourceId: candidateId,
        currentPath: normalizeCurrentPath(path),
        ...(from ? { from } : {}),
      },
    });
  }

  const isAddLibraryFlow = from === "add-library" && currentPath === "/";
  const closeTarget = isAddLibraryFlow ? "/settings/add-library" : "/settings";
  const isRootBrowser = currentPath === "/";

  const { options, toolbar } = useScreenHeader({
    ...(isRootBrowser
      ? { close: { target: closeTarget, dismissTo: true, variant: "layout" } }
      : {}),
    backTitle: t("reader.back"),
    right: [
      createSaveAction({
        label: saving ? label("validating") : label("selectDirectory"),
        onPress: () =>
          void chooseCurrentPath({
            notValidTitle: label("notValidLibrary.title"),
            notValidMessage: label("notValidLibrary.message"),
            generic: label("notCalibreLibrary"),
          }),
        loading: saving,
        color: palette.primary,
      }),
    ],
  });

  if (notFound) {
    return (
      <Screen>
        <EmptyState
          title={label("notFound.title")}
          detail={label("notFound.detail")}
          icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }}
        />
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={options} />
      {toolbar}

      <Screen>
        <ErrorBoundary
          title={label("loadFailed.title")}
          message={label("loadFailed.message")}
          onRetry={() => { /* effect re-triggers via loading/error state */ }}
        >
          <View className="gap-3">
            <Text className="px-4 text-[16px] text-muted" style={{ color: palette.textMuted }}>
              {label("currentPath", { path: currentPath })}
            </Text>

            {loading ? (
              <EmptyState
                title={label("reading.title")}
                detail={label("reading.detail")}
                icon={{ ios: "hourglass", android: "hourglass-empty" }}
              />
            ) : resolveFailed ? (
              <EmptyState
                title={label("readFailed.title")}
                detail={label("noCredentials")}
                icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }}
              />
            ) : error ? (
              <EmptyState
                title={label("readFailed.title")}
                detail={error}
                icon={{ ios: "exclamationmark.triangle.fill", android: "warning" }}
              />
            ) : entries.length === 0 ? (
              <EmptyState
                title={label("empty.title")}
                detail={label("empty.detail")}
                icon={{ ios: "folder", android: "folder-open" }}
              />
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
          </View>
        </ErrorBoundary>
      </Screen>
    </>
  );
}
