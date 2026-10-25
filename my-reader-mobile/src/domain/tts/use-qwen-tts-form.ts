import { useMutation } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { normalizeTtsAudioFormat } from "@/src/constants/tts"
import {
  discoverQwenTtsVoices,
  getQwenTtsModels,
  type QwenTtsModel,
  type QwenTtsPreset,
  type TtsVoice,
} from "@/src/services/core/tts"
import { errorMessage } from "@/src/i18n/error-message"

export function qwenModelFields(model: QwenTtsModel) {
  return {
    model: model.id,
    voices: "",
    defaultVoice: model.voices[0]?.id ?? "",
    responseFormat: normalizeTtsAudioFormat(model.audioFormats[0]),
    instructions: "",
  }
}

export function newQwenProviderFields(preset: QwenTtsPreset, name: string) {
  return {
    kind: "qwen" as const,
    name,
    endpoint: preset.endpoint,
    model: "",
    voices: "",
    defaultVoice: "",
    responseFormat: "wav" as const,
    instructions: "",
  }
}

type QwenTtsFormDraft = {
  id?: string
  kind: string
  model: string
  endpoint: string
  credential: string
  hasCredential: boolean
  clearCredential: boolean
  voices: string
  defaultVoice: string
} | null

function useQwenModels(draft: QwenTtsFormDraft) {
  const enabled = draft?.kind === "qwen"
  const endpoint = draft?.endpoint ?? ""
  const profileId = draft?.hasCredential ? draft.id : undefined
  const credential = draft?.credential ?? ""
  const source = JSON.stringify([
    enabled,
    endpoint,
    profileId,
    credential,
    draft?.clearCredential,
  ])
  const {
    mutate: fetchModels,
    data: modelResult,
    error,
    variables,
  } = useMutation({
    mutationFn: async (input: {
      endpoint: string
      profileId?: string
      credential?: string
      signal: AbortSignal
      source: string
    }) => ({
      source: input.source,
      models: await getQwenTtsModels(input, input.signal),
    }),
  })
  useEffect(() => {
    if (!enabled || draft?.clearCredential || !(credential.trim() || profileId))
      return
    const controller = new AbortController()
    const timer = setTimeout(
      () =>
        fetchModels({
          endpoint,
          profileId,
          credential,
          signal: controller.signal,
          source,
        }),
      400,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [
    enabled,
    endpoint,
    profileId,
    credential,
    draft?.clearCredential,
    fetchModels,
    source,
  ])
  return {
    models: modelResult?.source === source ? modelResult.models : [],
    error: variables?.source === source && error ? errorMessage(error) : null,
  }
}

export function useQwenTtsForm(draft: QwenTtsFormDraft) {
  const { models, error: modelError } = useQwenModels(draft)
  const enabled = draft?.kind === "qwen"
  const endpoint = draft?.endpoint ?? ""
  const model = draft?.model ?? ""
  const profileId = draft?.hasCredential ? draft.id : undefined
  const credential = draft?.credential ?? ""
  const [discovered, setDiscovered] = useState<TtsVoice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedModel = enabled
    ? models.find((model) => model.id === draft.model)
    : undefined
  const canDiscover = Boolean(
    selectedModel?.voiceDiscovery &&
      !draft?.clearCredential &&
      (credential.trim() || profileId),
  )
  useEffect(() => {
    if (!enabled) return
    setDiscovered([])
    setError(null)
    setLoading(canDiscover)
    if (!canDiscover) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void discoverQwenTtsVoices(
        { endpoint, model, profileId, credential },
        controller.signal,
      )
        .then((voices) => {
          if (!controller.signal.aborted) setDiscovered(voices)
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(errorMessage(cause))
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 400)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, canDiscover, endpoint, model, profileId, credential])

  return {
    models,
    selectedModel,
    loading: enabled && loading,
    error: enabled ? error || modelError : null,
    ...qwenVoiceOptions(draft, selectedModel, discovered),
  }
}

function qwenVoiceOptions(
  draft: QwenTtsFormDraft,
  selectedModel: QwenTtsModel | undefined,
  discovered: TtsVoice[],
) {
  const knownVoices = [...(selectedModel?.voices ?? []), ...discovered]
  const ids = [
    ...new Set(
      [
        ...knownVoices.map((voice) => voice.id),
        ...(draft?.voices
          .split(/\r?\n/)
          .map((id) => id.trim())
          .filter(Boolean) ?? []),
        draft?.defaultVoice.trim() ?? "",
      ].filter(Boolean),
    ),
  ]
  return {
    voices: ids.map((id) => ({
      id,
      name: knownVoices.find((voice) => voice.id === id)?.name ?? id,
    })),
    manualVoices:
      draft?.voices
        .split(/\r?\n/)
        .filter((id) => !selectedModel?.voices.some((voice) => voice.id === id))
        .join("\n") ?? "",
  }
}
