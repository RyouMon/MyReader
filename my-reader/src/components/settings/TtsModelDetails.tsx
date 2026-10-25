import { useTranslation } from "react-i18next"
import { TtsVoicesEditor } from "@/components/settings/TtsVoicesEditor"
import { Button } from "@/components/ui/button"
import type { TtsProviderDraft } from "@/lib/tts-provider-draft"
import type { TtsModelDto } from "@/lib/tauri-specta"

export function TtsModelDetails({
  draft,
  model,
  readOnly,
  onVoicesChange,
  onRefresh,
}: {
  draft: TtsProviderDraft
  model: TtsModelDto
  readOnly: boolean
  onVoicesChange: (voices: string[], names: Record<string, string>) => void
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  return (
    <TtsVoicesEditor
      draft={draft}
      model={model}
      readOnly={readOnly}
      embedded
      onChange={onVoicesChange}
      actions={
        !readOnly && draft.kind === "qwen" && model.model.trim() ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRefresh}>
            {t("providerEditor.fetchVoices")}
          </Button>
        ) : null
      }
    />
  )
}
