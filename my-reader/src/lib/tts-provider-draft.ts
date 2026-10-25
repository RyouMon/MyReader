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
    displayName: catalog?.name ?? "",
    voiceNames: {},
    responseFormat: catalog?.audioFormats[0] ?? "mp3",
    instructions: null,
    voices: catalog?.voices.map((voice) => voice.id) ?? [],
    defaultVoice: catalog?.voices[0]?.id ?? null,
    ...(catalog
      ? {
          voiceNames: Object.fromEntries(
            catalog.voices.map((voice) => [voice.id, voice.name]),
          ),
        }
      : {}),
  }
}

export function mergeTtsVoices(
  model: TtsModelDto,
  voices: TtsVoiceDto[],
): TtsModelDto {
  return {
    ...model,
    voices: [...new Set([...model.voices, ...voices.map((voice) => voice.id)])],
    voiceNames: {
      ...Object.fromEntries(voices.map((voice) => [voice.id, voice.name])),
      ...model.voiceNames,
    },
    defaultVoice: model.defaultVoice || voices[0]?.id || null,
  }
}

export function ttsDraftInput(
  draft: TtsProviderDraft,
  model = draft.models[0],
  voiceId = model?.defaultVoice,
): UpsertTtsProviderInput {
  const voices = modelVoices(draft) ? (model?.voices ?? []) : draft.voices
  return {
    profile: {
      id: draft.id,
      name: draft.name.trim(),
      kind: draft.kind,
      enabled: draft.enabled,
      endpoint: draft.endpoint.trim(),
      model: model?.model.trim() || null,
      options: {
        kind: draft.kind,
        responseFormat: model?.responseFormat ?? "mp3",
        instructions: model?.instructions || null,
        voices: [
          ...new Set([
            ...voices.map((voice) => voice.trim()).filter(Boolean),
            ...(voiceId ? [voiceId.trim()] : []),
          ]),
        ],
        defaultVoice: voiceId?.trim() || null,
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
  const voices = scoped
    ? draft.voices
    : [...new Set(draft.models.flatMap((model) => model.voices))]
  const names = scoped
    ? draft.voiceNames
    : Object.assign({}, ...draft.models.map((model) => model.voiceNames))
  return {
    ...draft,
    modelScopedVoices: scoped,
    voices: scoped ? [] : voices,
    voiceNames: scoped ? {} : names,
    models: draft.models.map((model) => ({
      ...model,
      voices: scoped ? [...voices] : [],
      voiceNames: scoped ? { ...names } : {},
      defaultVoice:
        model.defaultVoice && voices.includes(model.defaultVoice)
          ? model.defaultVoice
          : (voices[0] ?? null),
    })),
  }
}

export function updatedDefaultVoice(
  current: string | null,
  previous: string[],
  next: string[],
) {
  if (current && next.includes(current)) return current
  const index = current ? previous.indexOf(current) : -1
  if (previous.length === next.length && index >= 0 && next[index]?.trim())
    return next[index]
  return next.find((id) => id.trim()) ?? null
}
