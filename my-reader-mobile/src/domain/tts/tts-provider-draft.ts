import {
  mergeDiscoveredTtsVoices,
  ttsProviderMeta,
  ttsUsesModelScopedVoices,
} from "@my-reader/tools/tts-providers"
import { randomUUID } from "expo-crypto"
import type {
  MobileTtsModel,
  MobileTtsProvider,
  QwenTtsModel,
  TtsVoice,
  UpsertMobileTtsProfileInput,
} from "@/src/services/core/tts"

export type TtsProviderDraft = MobileTtsProvider & {
  credential: string
  clearCredential: boolean
}

export const usesModelVoices = (draft: MobileTtsProvider) =>
  ttsUsesModelScopedVoices(draft)

export function newTtsModel(
  model = "",
  catalog?: QwenTtsModel,
  kind = "openAiCompatible",
): MobileTtsModel {
  const meta = ttsProviderMeta(kind)
  return {
    id: randomUUID(),
    model,
    responseFormat: catalog?.audioFormats[0] ?? meta.defaultFormat,
    voices: catalog?.voices.length
      ? catalog.voices.map((voice) => voice.id)
      : [""],
    voiceNames: {},
  }
}

export function newTtsDraft(
  kind = "openAiCompatible",
  displayName?: string,
): TtsProviderDraft {
  const meta = ttsProviderMeta(kind)
  const scoped = meta.forcesModelScopedVoices
  return {
    id: "",
    kind: meta.kind,
    name: displayName ?? meta.defaultName,
    endpoint: meta.defaultEndpoint,
    modelScopedVoices: scoped,
    models: [
      {
        ...newTtsModel(meta.defaultModel, undefined, meta.kind),
        voices: scoped ? [""] : [],
      },
    ],
    voices: scoped ? [] : [""],
    voiceNames: {},
    hasCredential: false,
    credential: "",
    clearCredential: false,
  }
}

export function previewInput(
  draft: TtsProviderDraft,
  model = draft.models[0],
): UpsertMobileTtsProfileInput {
  const meta = ttsProviderMeta(draft.kind)
  return {
    profile: {
      id: draft.id || undefined,
      name: draft.name,
      endpoint: draft.endpoint,
      kind: draft.kind,
      model: model?.model,
      responseFormat: model?.responseFormat ?? meta.defaultFormat,
      instructions: model?.instructions,
      voices: (usesModelVoices(draft)
        ? (model?.voices ?? [])
        : draft.voices
      ).filter((id) => id.trim()),
    },
    credential: draft.credential.trim() || undefined,
    clearCredential: draft.clearCredential,
  }
}

export function mergeVoices(model: MobileTtsModel, incoming: TtsVoice[]) {
  const merged = mergeDiscoveredTtsVoices(
    model.voices,
    model.voiceNames,
    incoming,
  )
  return {
    ...model,
    voices: merged.voices,
    voiceNames: merged.voiceNames,
  }
}

export function mergeSharedVoices(
  draft: TtsProviderDraft,
  incoming: TtsVoice[],
): TtsProviderDraft {
  const merged = mergeDiscoveredTtsVoices(
    draft.voices,
    draft.voiceNames,
    incoming,
  )
  return {
    ...draft,
    voices: merged.voices,
    voiceNames: merged.voiceNames,
  }
}

export function setVoiceScope(
  draft: TtsProviderDraft,
  scoped: boolean,
): TtsProviderDraft {
  const existing = (
    scoped
      ? draft.voices
      : [...new Set(draft.models.flatMap((model) => model.voices))]
  ).filter((voice) => voice.trim())
  const voices = existing.length ? existing : [""]
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

export function updateVoices(
  draft: TtsProviderDraft,
  modelId: string | undefined,
  voices: string[],
  voiceNames: Record<string, string> = {},
): TtsProviderDraft {
  if (!usesModelVoices(draft)) return { ...draft, voices, voiceNames }
  return {
    ...draft,
    models: draft.models.map((model) =>
      model.id === modelId ? { ...model, voices, voiceNames } : model,
    ),
  }
}
