import type {
  QwenTtsModelDto,
  TtsModelDto,
  TtsProviderDto,
  TtsVoiceDto,
  UpsertTtsProviderInput,
} from "@/lib/tauri-specta"

export type TtsProviderDraft = TtsProviderDto & {
  credential: string
  clearCredential: boolean
}
export const modelVoices = (provider: TtsProviderDto) =>
  provider.kind === "qwen" || provider.modelScopedVoices

export function newTtsModel(
  model = "",
  catalog?: QwenTtsModelDto,
): TtsModelDto {
  return {
    id: crypto.randomUUID(),
    model,
    responseFormat: catalog?.audioFormats[0] ?? "mp3",
    instructions: null,
    voices: catalog?.voices.length
      ? catalog.voices.map((voice) => voice.id)
      : [""],
  }
}

export function mergeTtsVoices(
  model: TtsModelDto,
  voices: TtsVoiceDto[],
): TtsModelDto {
  const merged = [
    ...new Set([
      ...model.voices.filter(Boolean),
      ...voices.map((voice) => voice.id),
    ]),
  ]
  return {
    ...model,
    voices: merged.length ? merged : [""],
  }
}

export function ttsDraftInput(
  draft: TtsProviderDraft,
  model = draft.models[0],
): UpsertTtsProviderInput {
  const voices = modelVoices(draft) ? (model?.voices ?? []) : draft.voices
  return {
    profile: {
      id: draft.id,
      name: draft.name.trim(),
      kind: draft.kind,
      endpoint: draft.endpoint.trim(),
      model: model?.model.trim() || null,
      options: {
        kind: draft.kind,
        responseFormat: model?.responseFormat ?? "mp3",
        instructions: model?.instructions || null,
        voices: [
          ...new Set(voices.map((voice) => voice.trim()).filter(Boolean)),
        ],
      },
    },
    credential: draft.credential.trim() || null,
    clearCredential: draft.clearCredential,
  }
}

export function setTtsVoiceScope(
  draft: TtsProviderDraft,
  scoped: boolean,
): TtsProviderDraft {
  const configured = scoped
    ? draft.voices
    : [...new Set(draft.models.flatMap((model) => model.voices))]
  const voices = configured.length ? configured : [""]
  const voiceNames = scoped
    ? (draft.voiceNames ?? {})
    : Object.assign({}, ...draft.models.map((model) => model.voiceNames ?? {}))
  return {
    ...draft,
    modelScopedVoices: scoped,
    voices: scoped ? [] : voices,
    voiceNames: scoped ? {} : voiceNames,

    models: draft.models.map((model) => ({
      ...model,
      voices: scoped ? [...voices] : [],
      voiceNames: scoped ? { ...voiceNames } : {},
    })),
  }
}
