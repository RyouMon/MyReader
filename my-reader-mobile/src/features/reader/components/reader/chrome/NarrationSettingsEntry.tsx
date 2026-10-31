import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { FormSwitch } from "@/src/components"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import {
  readerFormColors,
  type ReaderChromePalette,
} from "@/src/design/reader-chrome-palette"
import { useThemePalette } from "@/src/design/tokens"
import type { useBookNarration } from "@/src/domain/llm/use-book-narration"
import { getLlmConfig } from "@/src/services/core/llm"
import type { BookNarrationSettings } from "@/src/services/core/narration"
import { errorMessage } from "@/src/i18n/error-message"
import { Text } from "@/tw"
import { ReaderChoiceRow } from "./ReaderChoiceRow"
import { ReaderSheetPage } from "./ReaderSheetPage"

export function NarrationSettingsEntry({
  settings,
  palette,
  save,
  onChange,
  onEdit,
  errorNode,
  children,
}: {
  settings: BookNarrationSettings
  palette: ReaderChromePalette
  save: ReturnType<typeof useBookNarration>["save"]
  onChange?: () => void
  onEdit: () => void
  errorNode: ReactNode
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const theme = useThemePalette()
  const [enableError, setEnableError] = useState<string | null>(null)
  return (
    <ReaderSheetPage>
      <FormSwitch
        label={t("narration.enabled")}
        align="between"
        colors={readerFormColors(palette)}
        value={settings.enabled}
        disabled={save.isPending}
        onValueChange={(enabled) => {
          setEnableError(null)
          if (!enabled) {
            save.mutate({ ...settings, enabled }, { onSuccess: onChange })
            return
          }
          void getLlmConfig()
            .then((llm) => {
              if (!llm.defaultProfileId) {
                setEnableError(t("narration.llmRequired"))
                return
              }
              showAlertWithStatusBarRestore(
                t("narration.enabled"),
                t("narration.enableNotice"),
                [
                  { text: t("llm.cancel"), style: "cancel" },
                  {
                    text: t("narration.enableConfirm"),
                    onPress: () =>
                      save.mutate(
                        { ...settings, enabled: true },
                        { onSuccess: onChange },
                      ),
                  },
                ],
              )
            })
            .catch((value) => setEnableError(errorMessage(value)))
        }}
      />
      {enableError ? (
        <Text accessibilityRole="alert" style={{ color: theme.danger }}>
          {enableError}
        </Text>
      ) : (
        errorNode
      )}
      {settings.enabled ? (
        <ReaderChoiceRow
          title={t("narration.edit")}
          detail={
            settings.scopeName
              ? t("narration.series", { name: settings.scopeName })
              : undefined
          }
          palette={palette}
          onPress={onEdit}
        />
      ) : null}
      {children}
    </ReaderSheetPage>
  )
}
