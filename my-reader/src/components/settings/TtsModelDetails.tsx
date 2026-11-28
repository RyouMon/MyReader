import { ttsProviderMeta } from "@my-reader/tools/tts-providers"
import { useTranslation } from "react-i18next"
import { TtsVoicesEditor } from "@/components/settings/TtsVoicesEditor"
import { Button } from "@/components/ui/button"
import type { TtsModelDto } from "@/lib/tauri-specta"
import type { TtsProviderDraft } from "@/lib/tts-provider-draft"

export function TtsModelDetails({
  draft,
  model,
  fieldErrors,
  onCredentialRequired,
  onVoicesChange,
  onRefresh,
}: {
  draft: TtsProviderDraft
  model: TtsModelDto
  fieldErrors?: Record<string, string>
  onCredentialRequired?: () => void
  onVoicesChange: (voices: string[], names: Record<string, string>) => void
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const canFetchVoices =
    ttsProviderMeta(draft.kind).supportsVoiceDiscovery &&
    Boolean(draft.endpoint.trim()) &&
    (draft.kind !== "qwen" || Boolean(model.model.trim()))
  return (
    <TtsVoicesEditor
      draft={draft}
      model={model}
      fieldErrors={fieldErrors}
      onCredentialRequired={onCredentialRequired}
      onChange={onVoicesChange}
      actions={
        canFetchVoices ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRefresh}>
            {t("providerEditor.fetchVoices")}
          </Button>
        ) : null
      }
    />
  )
}
