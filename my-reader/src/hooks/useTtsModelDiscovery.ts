import { useMutation } from "@tanstack/react-query"
import { api } from "@/lib/tauri-api"
import {
  mergeTtsVoices,
  newTtsModel,
  ttsDraftInput,
  type TtsProviderDraft,
} from "@/lib/tts-provider-draft"
import type { QwenTtsModelDto, TtsModelDto } from "@/lib/tauri-specta"

export function useTtsModelDiscovery() {
  const discover = useMutation({
    mutationFn: async ({
      draft,
    }: {
      draft: TtsProviderDraft
      catalog: QwenTtsModelDto[]
    }) => {
      if (draft.kind === "qwen") {
        const models = await api.listQwenTtsModels(ttsDraftInput(draft))
        return models.map((model) => ({
          id: model.id,
          qwen: model,
        }))
      }
      return (await api.discoverTtsModels(ttsDraftInput(draft))).map((id) => ({
        id,
        qwen: undefined,
      }))
    },
  })
  const voices = useMutation({
    mutationFn: async ({
      draft,
      ids,
      catalog,
    }: {
      draft: TtsProviderDraft
      ids: string[]
      catalog: QwenTtsModelDto[]
    }) => {
      return Promise.all(
        ids.map(async (id) => {
          const known =
            draft.kind === "qwen"
              ? catalog.find((model) => model.id === id)
              : undefined
          const model = newTtsModel(id, known, draft.kind)
          if (draft.kind === "qwen" && known?.voiceDiscovery !== false) {
            const discovered = await api.discoverQwenTtsVoices({
              endpoint: draft.endpoint,
              model: id,
              profileId: draft.clearCredential ? null : draft.id || null,
              credential: draft.clearCredential
                ? null
                : draft.credential.trim() || null,
            })
            return mergeTtsVoices(model, discovered)
          }
          return model
        }),
      )
    },
  })
  const fetchVoices = useMutation({
    mutationFn: async ({
      draft,
      model,
    }: {
      draft: TtsProviderDraft
      model?: TtsModelDto
    }) => {
      if (draft.kind === "qwen" && model?.model.trim()) {
        return api.discoverQwenTtsVoices({
          endpoint: draft.endpoint,
          model: model.model.trim(),
          profileId: draft.clearCredential ? null : draft.id || null,
          credential: draft.clearCredential
            ? null
            : draft.credential.trim() || null,
        })
      }
      return api.discoverTtsVoices(ttsDraftInput(draft, model))
    },
  })
  return { discover, voices, fetchVoices }
}
