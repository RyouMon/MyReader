import { normalizeCurrentPath } from "@/src/domain/library/remote-library";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams, type RelativePathString } from "expo-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

import { useThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

import { EmptyState, Screen, SectionCard, SettingsRow, type HeaderToolbarAction } from "@/src/components";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { HeaderToolbar } from "@/src/components/ui/header-toolbar";
import { modalCloseToolbarAction } from "@/src/components/ui/modal-close-toolbar-action";
import { useRemoteDirectoryBrowser } from "@/src/features/settings/hooks/use-remote-directory-browser";
import {
  ADD_LIBRARY_FLOW,
  resolveRemoteDirectoryBrowserHeaderLead,
} from "@/src/navigation/settings-modal-header";

const ADD_LIBRARY_BROWSER_FALLBACK = "/settings/add-library" as RelativePathString;

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

  const leftToolbar = useMemo((): HeaderToolbarAction[] | undefined => {
    const lead = resolveRemoteDirectoryBrowserHeaderLead({
      platform: Platform.OS === "ios" ? "ios" : "android",
      from,
      currentPath,
    });

    if (lead !== "toolbar-close") {
      return undefined;
    }

    return [
      modalCloseToolbarAction(t("common.close"), ADD_LIBRARY_BROWSER_FALLBACK, { dismissTo: true }),
    ];
  }, [currentPath, from, t]);

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
      <HeaderToolbar
        left={leftToolbar}
        right={[
          {
            label: saving ? label("validating") : label("selectDirectory"),
            onPress: () =>
              void chooseCurrentPath({
                notValidTitle: label("notValidLibrary.title"),
                notValidMessage: label("notValidLibrary.message"),
                generic: label("notCalibreLibrary"),
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
