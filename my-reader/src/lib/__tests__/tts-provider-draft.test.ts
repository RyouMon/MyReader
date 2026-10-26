import { expect, it } from "vitest"
import {
  mergeTtsVoices,
  newTtsModel,
  setTtsVoiceScope,
  ttsDraftInput,
  updatedDefaultVoice,
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

    models: [
      { ...newTtsModel("first"), defaultVoice: "reader" },
      { ...newTtsModel("second"), defaultVoice: "actor" },
    ],
  }
}
it("moves voices between shared and model scopes without losing IDs or defaults", () => {
  const original = draft()
  const scoped = setTtsVoiceScope(original, true)
  expect(scoped.voices).toEqual([])
  expect(scoped.models.map((m) => m.voices)).toEqual([
    original.voices,
    original.voices,
  ])
  scoped.models[1].voices.push("guest")
  const shared = setTtsVoiceScope(scoped, false)
  expect(shared.voices).toEqual(["reader", "actor", "guest"])
  expect(shared.models.map((m) => [m.id, m.defaultVoice])).toEqual(
    original.models.map((m) => [m.id, m.defaultVoice]),
  )
})
it("merges a discovered voice catalog without duplicates or changing the selected ID", () => {
  const model = {
    ...newTtsModel("tts"),
    voices: ["Cherry"],

    defaultVoice: "Cherry",
  }
  const result = mergeTtsVoices(model, [
    { id: "Cherry", language: "zh", gender: null },
    { id: "new", language: "zh", gender: null },
  ])
  expect(result.voices).toEqual(["Cherry", "new"])
  expect(result.defaultVoice).toBe("Cherry")
})
it("builds a test for the selected unsaved model and voice while retaining provider credential identity", () => {
  const provider = draft()
  const result = ttsDraftInput(provider, provider.models[1], "actor")
  expect(result.profile).toMatchObject({
    id: "provider",
    model: "second",
    options: { defaultVoice: "actor", voices: ["reader", "actor"] },
  })
  expect(result.credential).toBe("draft-key")
})
it("keeps the renamed default voice and chooses a surviving voice on deletion", () => {
  expect(
    updatedDefaultVoice("actor", ["reader", "actor"], ["reader", "renamed"]),
  ).toBe("renamed")
  expect(updatedDefaultVoice("actor", ["reader", "actor"], ["reader"])).toBe(
    "reader",
  )
  expect(updatedDefaultVoice("actor", ["actor"], [])).toBeNull()
})
