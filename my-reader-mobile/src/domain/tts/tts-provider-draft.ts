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
    voices: catalog?.voices.map((voice) => voice.id) ?? [],
    defaultVoice: catalog?.voices[0]?.id,
  }
}

export function newTtsDraft(): TtsProviderDraft {
  return {
    id: "",
    kind: "openAiCompatible",
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    modelScopedVoices: false,
    models: [newTtsModel("gpt-4o-mini-tts")],
    voices: [],
    hasCredential: false,
    credential: "",
    clearCredential: false,
  }
}

export function previewInput(
  draft: TtsProviderDraft,
  model = draft.models[0],
  voice = model?.defaultVoice,
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
      defaultVoice: voice?.trim(),
    },
    credential: draft.credential.trim() || undefined,
    clearCredential: draft.clearCredential,
  }
}

export function mergeVoices(model: MobileTtsModel, incoming: TtsVoice[]) {
  return {
    ...model,
    voices: [
      ...new Set([...model.voices, ...incoming.map((voice) => voice.id)]),
    ],
    defaultVoice: model.defaultVoice || incoming[0]?.id,
  }
}

export function setVoiceScope(
  draft: TtsProviderDraft,
  scoped: boolean,
): TtsProviderDraft {
  const voices = scoped
    ? draft.voices
    : [...new Set(draft.models.flatMap((model) => model.voices))]
  return {
    ...draft,
    modelScopedVoices: scoped,
    voices: scoped ? [] : voices,

    models: draft.models.map((model) => ({
      ...model,
      voices: scoped ? [...voices] : [],

      defaultVoice:
        model.defaultVoice && voices.includes(model.defaultVoice)
          ? model.defaultVoice
          : voices[0],
    })),
  }
}

export function updateVoices(
  draft: TtsProviderDraft,
  modelId: string | undefined,
  voices: string[],
): TtsProviderDraft {
  const scoped = usesModelVoices(draft)
  return {
    ...draft,
    ...(scoped ? {} : { voices }),
    models: draft.models.map((model) => {
      if (scoped && model.id !== modelId) return model
      const previous = scoped ? model.voices : draft.voices
      const index = previous.indexOf(model.defaultVoice ?? "")
      const defaultVoice =
        model.defaultVoice && voices.includes(model.defaultVoice)
          ? model.defaultVoice
          : previous.length === voices.length &&
              index >= 0 &&
              voices[index]?.trim()
            ? voices[index]
            : voices.find((id) => id.trim())
      return {
        ...model,
        ...(scoped ? { voices } : {}),
        defaultVoice,
      }
    }),
  }
}

export function validTtsDraft(draft: TtsProviderDraft | null) {
  return Boolean(
    draft?.name.trim() &&
      draft.endpoint.trim() &&
      draft.models.length &&
      draft.models.every((model) => model.model.trim()) &&
      (usesModelVoices(draft)
        ? draft.models.every((model) => model.voices.every((id) => id.trim()))
        : draft.voices.every((id) => id.trim())) &&
      new Set(draft.models.map((model) => model.model.trim())).size ===
        draft.models.length,
  )
}
