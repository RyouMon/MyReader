import { useMutation } from "@tanstack/react-query"
import {
  discoverQwenTtsVoices,
  discoverTtsModels,
  getQwenTtsModels,
  type QwenTtsModel,
} from "@/src/services/core/tts"
import {
  mergeVoices,
  newTtsModel,
  previewInput,
  type TtsProviderDraft,
} from "./tts-provider-draft"

export function useTtsModelDiscovery() {
  const discover = useMutation({
    mutationFn: async ({
      draft,
      signal,
    }: {
      draft: TtsProviderDraft
      signal: AbortSignal
    }) => {
      if (draft.kind === "qwen") {
        return (
          await getQwenTtsModels(
            {
              endpoint: draft.endpoint,
              profileId: draft.clearCredential
                ? undefined
                : draft.id || undefined,
              credential: draft.clearCredential
                ? undefined
                : draft.credential.trim() || undefined,
            },
            signal,
          )
        ).map((qwen) => ({ id: qwen.id, qwen }))
      }
      return (await discoverTtsModels(previewInput(draft), signal)).map(
        (id) => ({ id, qwen: undefined }),
      )
    },
  })
  const voices = useMutation({
    mutationFn: async ({
      draft,
      ids,
      catalog,
      signal,
    }: {
      draft: TtsProviderDraft
      ids: string[]
      catalog: QwenTtsModel[]
      signal: AbortSignal
    }) =>
      Promise.all(
        ids.map(async (id) => {
          const known = catalog.find((model) => model.id === id)
          const model = newTtsModel(id, known)
          if (draft.kind !== "qwen" || known?.voiceDiscovery === false)
            return model
          return mergeVoices(
            model,
            await discoverQwenTtsVoices(
              {
                endpoint: draft.endpoint,
                model: id,
                profileId: draft.clearCredential
                  ? undefined
                  : draft.id || undefined,
                credential: draft.clearCredential
                  ? undefined
                  : draft.credential.trim() || undefined,
              },
              signal,
            ),
          )
        }),
      ),
  })
  return { discover, voices }
}
