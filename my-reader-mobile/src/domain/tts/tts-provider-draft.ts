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
  draft.kind === "qwen" || draft.modelScopedVoices

export function newTtsModel(
  model = "",
  catalog?: QwenTtsModel,
): MobileTtsModel {
  return {
    id: randomUUID(),
    model,
    responseFormat: catalog?.audioFormats[0] ?? "mp3",
    voices: catalog?.voices.length
      ? catalog.voices.map((voice) => voice.id)
      : [""],
  }
}

export function newTtsDraft(): TtsProviderDraft {
  return {
    id: "",
    kind: "openAiCompatible",
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    modelScopedVoices: false,
    models: [{ ...newTtsModel("gpt-4o-mini-tts"), voices: [] }],
    voices: [""],
    hasCredential: false,
    credential: "",
    clearCredential: false,
  }
}

export function previewInput(
  draft: TtsProviderDraft,
  model = draft.models[0],
): UpsertMobileTtsProfileInput {
  return {
    profile: {
      id: draft.id || undefined,
      name: draft.name,
      endpoint: draft.endpoint,
      kind: draft.kind,
      model: model?.model,
      responseFormat: model?.responseFormat ?? "mp3",
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
  const voices = [
    ...new Set([
      ...model.voices.filter((id) => id.trim()),
      ...incoming.map((voice) => voice.id),
    ]),
  ]
  return {
    ...model,
    voices: voices.length ? voices : [""],
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
