import { expect, it } from "vitest"
import {
  mergeTtsVoices,
  newTtsModel,
  setTtsVoiceScope,
  ttsDraftInput,
  type TtsProviderDraft,
} from "../tts-provider-draft"

function draft(): TtsProviderDraft {
  return {
    id: "provider",
    name: "Local",
    kind: "openAiCompatible",
    endpoint: "http://localhost/v1",
    credential: "draft-key",
    hasCredential: true,
    clearCredential: false,
    modelScopedVoices: false,
    voices: ["reader", "actor"],
    voiceNames: { reader: "Narrator" },

    models: [newTtsModel("first"), newTtsModel("second")],
  }
}
it("moves voices between shared and model scopes without losing IDs or names", () => {
  const original = draft()
  const scoped = setTtsVoiceScope(original, true)
  expect(scoped.voices).toEqual([])
  expect(scoped.models[0]?.voiceNames).toEqual({ reader: "Narrator" })
  expect(scoped.models.map((m) => m.voices)).toEqual([
    original.voices,
    original.voices,
  ])
  scoped.models[1].voices.push("guest")
  const shared = setTtsVoiceScope(scoped, false)
  expect(shared.voices).toEqual(["reader", "actor", "guest"])
  expect(shared.voiceNames).toEqual({ reader: "Narrator" })
  expect(shared.models.map((m) => m.id)).toEqual(
    original.models.map((m) => m.id),
  )
})
it("appends newly discovered voices without duplicating saved IDs", () => {
  const model = {
    ...newTtsModel("tts"),
    voices: ["Cherry"],
  }
  const result = mergeTtsVoices(model, [
    { id: "Cherry", language: "zh", gender: null },
    { id: "new", language: "zh", gender: null },
  ])
  expect(result.voices).toEqual(["Cherry", "new"])
})
it("includes the audition model's shared voices and provider credential identity", () => {
  const provider = draft()
  const result = ttsDraftInput(provider, provider.models[1])
  expect(result.profile).toMatchObject({
    id: "provider",
    model: "second",
    options: { voices: ["reader", "actor"] },
  })
  expect(result.credential).toBe("draft-key")
})
