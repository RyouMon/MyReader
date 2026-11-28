import {
  mergeDiscoveredTtsVoices,
  ttsDefaultEndpoint,
  ttsProviderMeta,
  ttsUsesModelScopedVoices,
  type TtsRegionContext,
} from "@my-reader/tools/tts-providers"
import type {
  QwenTtsModelDto,
  TtsModelDto,
  TtsProviderDto,
  TtsProviderKindDto,
  TtsVoiceDto,
  UpsertTtsProviderInput,
} from "@/lib/tauri-specta"

export type TtsProviderDraft = TtsProviderDto & {
  credential: string
  clearCredential: boolean
}

export const modelVoices = (provider: TtsProviderDto) =>
  ttsUsesModelScopedVoices(provider)

export function newTtsModel(
  model = "",
  catalog?: QwenTtsModelDto,
  kind: TtsProviderKindDto = "openAiCompatible",
): TtsModelDto {
  const meta = ttsProviderMeta(kind)
  return {
    id: crypto.randomUUID(),
    model,
    responseFormat: catalog?.audioFormats[0] ?? meta.defaultFormat,
    instructions: null,
    voices: catalog?.voices.length
      ? catalog.voices.map((voice) => voice.id)
      : [""],
    voiceNames: {},
  }
}

export function newTtsProviderDraft(
  kind: TtsProviderKindDto = "openAiCompatible",
  displayName?: string,
  region?: TtsRegionContext | boolean,
): TtsProviderDraft {
  const meta = ttsProviderMeta(kind)
  const scoped = meta.forcesModelScopedVoices
  return {
    id: "",
    name: displayName ?? meta.defaultName,
    kind,
    endpoint: ttsDefaultEndpoint(kind, region),
    modelScopedVoices: scoped,
    models: [
      {
        ...newTtsModel(meta.defaultModel, undefined, kind),
        voices: scoped ? [""] : [],
      },
    ],
    voices: scoped ? [] : [""],
    voiceNames: {},
    credential: "",
    hasCredential: false,
    clearCredential: false,
  }
}

export function mergeTtsVoices(
  model: TtsModelDto,
  voices: TtsVoiceDto[],
): TtsModelDto {
  const merged = mergeDiscoveredTtsVoices(
    model.voices,
    model.voiceNames,
    voices,
  )
  return {
    ...model,
    voices: merged.voices,
    voiceNames: merged.voiceNames,
  }
}

export function mergeSharedTtsVoices(
  draft: TtsProviderDraft,
  voices: TtsVoiceDto[],
): TtsProviderDraft {
  const merged = mergeDiscoveredTtsVoices(
    draft.voices,
    draft.voiceNames,
    voices,
  )
  return {
    ...draft,
    voices: merged.voices,
    voiceNames: merged.voiceNames,
  }
}

export function ttsDraftInput(
  draft: TtsProviderDraft,
  model = draft.models[0],
): UpsertTtsProviderInput {
  const voices = modelVoices(draft) ? (model?.voices ?? []) : draft.voices
  const meta = ttsProviderMeta(draft.kind)
  return {
    profile: {
      id: draft.id,
      name: draft.name.trim(),
      kind: draft.kind,
      endpoint: draft.endpoint.trim(),
      model: model?.model.trim() || null,
      options: {
        kind: draft.kind,
        responseFormat: model?.responseFormat ?? meta.defaultFormat,
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
