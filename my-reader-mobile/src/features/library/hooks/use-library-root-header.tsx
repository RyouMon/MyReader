import CardsStackIcon from "@expo/material-symbols/cards_stack.xml"
import { type NativeStackNavigationOptions, router, Stack } from "expo-router"
import { type ReactNode, useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Platform } from "react-native"

import { AndroidHeaderIconButton } from "@/src/components/ui/android-header-icon-button"
import { AndroidHeaderActions } from "@/src/components/ui/android-header-layout"
import { useSyncStatusHeaderAction } from "@/src/features/sync/hooks/use-sync-status-header-action"
import { useScreenHeader } from "@/src/navigation/hooks/use-screen-header"
import { useAppStore } from "@/src/store/app-store"

/** Shared library switcher, search and sync actions for the Home and Library roots. */
export function useLibraryRootHeader(title: string) {
  const { t } = useTranslation()
  const syncAction = useSyncStatusHeaderAction()
  const canSearch = useAppStore(
    (state) =>
      state.storeReady &&
      state.libraries.some((library) => library.id === state.activeLibraryId),
  )
  const handleOpenLibrarySwitcher = useCallback(
    () => router.push("/switch-library"),
    [],
  )
  const searchAction = useMemo(
    () => ({
      label: t("common.search"),
      iosSfSymbol: "magnifyingglass" as const,
      iconOnly: true,
      disabled: !canSearch,
      onPress: () =>
        router.navigate(
          { pathname: "/library/catalog", params: { search: "1" } },
          { withAnchor: true },
        ),
    }),
    [canSearch, t],
  )
  const { options: baseOptions, toolbar: baseToolbar } = useScreenHeader({
    title,
    headerLargeTitle: true,
    right: [syncAction, searchAction],
  })

  const options = useMemo((): NativeStackNavigationOptions => {
    if (Platform.OS !== "android") return baseOptions
    return {
      ...baseOptions,
      headerTitleAlign: "center",
      headerLeft: () => (
        <AndroidHeaderActions>
          <AndroidHeaderIconButton
            accessibilityLabel={t("library.allLibraries")}
            icon={CardsStackIcon}
            onPress={handleOpenLibrarySwitcher}
            testID="library-switcher-button"
          />
        </AndroidHeaderActions>
      ),
    }
  }, [baseOptions, handleOpenLibrarySwitcher, t])

  const toolbar = useMemo((): ReactNode => {
    if (Platform.OS !== "ios") return baseToolbar
    return (
      <>
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            accessibilityLabel={t("library.allLibraries")}
            onPress={handleOpenLibrarySwitcher}
          >
            {t("library.allLibraries")}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
        {baseToolbar}
      </>
    )
  }, [baseToolbar, handleOpenLibrarySwitcher, t])

  return { options, toolbar }
}
