import { router } from "expo-router"
import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { useThemePalette } from "@/src/design/tokens"
import type { ScreenHeaderAction } from "@/src/navigation/hooks/use-screen-header"

import {
  SYNC_INDICATOR_LABEL_KEYS,
  SYNC_STATUS_IOS_SYMBOLS,
} from "../sync-status-visuals"
import { useSyncStatusPresentation } from "./use-sync-status-presentation"

export function useSyncStatusHeaderAction(): ScreenHeaderAction {
  const { t } = useTranslation()
  const palette = useThemePalette()
  const { indicator, library } = useSyncStatusPresentation()
  const handlePress = useCallback(() => router.push("/sync-status"), [])

  return useMemo(() => {
    const stateLabel = library
      ? t(SYNC_INDICATOR_LABEL_KEYS[indicator])
      : t("syncStatus.noActiveLibrary")

    return {
      label: t("syncStatus.accessibilityLabel", { status: stateLabel }),
      onPress: handlePress,
      iosSfSymbol: SYNC_STATUS_IOS_SYMBOLS[indicator],
      color: palette.text,
      iconOnly: true,
    }
  }, [handlePress, indicator, library, palette, t])
}
