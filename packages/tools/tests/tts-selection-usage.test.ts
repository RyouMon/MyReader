import { expect, it } from "vitest"
import { ttsModelVoices, ttsUsageMessage } from "../src/tts-selection-usage"

it("expands shared voices per model and keeps scoped Qwen voices separate", () => {
  const provider = {
    id: "provider",
    kind: "openAiCompatible",
    voices: ["shared"],
    models: [
      { id: "a", voices: ["a"] },
      { id: "b", voices: ["b"] },
    ],
  }
  expect(ttsModelVoices(provider)).toEqual([
    { id: "a", voices: ["shared"] },
    { id: "b", voices: ["shared"] },
  ])
  expect(ttsModelVoices({ ...provider, modelScopedVoices: true })).toEqual(
    provider.models,
  )
  expect(ttsModelVoices({ ...provider, kind: "qwen" })).toEqual(provider.models)
})

it("deduplicates global usage while identifying characters in their books or series", () => {
  const translate = (key: string, values?: Record<string, unknown>) =>
    String(
      values?.usages ??
        (key === "ttsRemoval.book" ? `Book ${values?.id}` : key),
    )
  expect(ttsUsageMessage([], translate)).toBe("")
  expect(
    ttsUsageMessage(
      [
        { profileId: "a" },
        { profileId: "a", language: "zh" },
        {
          profileId: "a",
          libraryName: "Library",
          scopeName: "Series",
          characterName: "Alice",
        },
        {
          profileId: "a",
          libraryName: "Library",
          bookId: 2,
          characterName: "Bob",
        },
      ],
      translate,
    ),
  ).toBe(
    "• ttsRemoval.global\n• Library · Series · Alice\n• Library · Book 2 · Bob",
  )
})
