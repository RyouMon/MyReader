import {
  mergeVoices,
  newTtsDraft,
  newTtsModel,
  previewInput,
  setVoiceScope,
  updateVoices,
} from "./tts-provider-draft"

describe("TTS provider drafts", () => {
  it("preserves voice IDs and model defaults when changing voice scope", () => {
    const draft = newTtsDraft()
    draft.voices = ["gentle", "bright"]
    draft.models = [
      { ...newTtsModel("first"), defaultVoice: "gentle" },
      { ...newTtsModel("second"), defaultVoice: "bright" },
    ]
    const scoped = setVoiceScope(draft, true)
    expect(scoped.models.map((model) => model.voices)).toEqual([
      draft.voices,
      draft.voices,
    ])
    const shared = setVoiceScope(scoped, false)
    expect(shared.voices).toEqual(draft.voices)
    expect(shared.models.map((model) => model.defaultVoice)).toEqual([
      "gentle",
      "bright",
    ])
  })

  it("renames a default voice only in its model and repairs it after deletion", () => {
    const draft = newTtsDraft()
    draft.modelScopedVoices = true
    draft.models = [
      {
        ...newTtsModel("first"),
        id: "first",
        voices: ["old", "other"],

        defaultVoice: "old",
      },
      { ...newTtsModel("second"), id: "second", instructions: "Quiet" },
    ]
    const renamed = updateVoices(draft, draft.models[0]!.id, ["new", "other"])
    expect(renamed.models[0]!.defaultVoice).toBe("new")
    expect(renamed.models[1]).toBe(draft.models[1])
    const removed = updateVoices(renamed, draft.models[0]!.id, ["other"])
    expect(removed.models[0]!.defaultVoice).toBe("other")
  })

  it("merges discovered voices without duplicating IDs or changing the selected ID", () => {
    const model = {
      ...newTtsModel("custom-model"),
      voices: ["saved"],

      defaultVoice: "saved",
    }
    const merged = mergeVoices(model, [
      { id: "saved", language: "en" },
      { id: "new", language: "zh" },
    ])
    expect(merged.voices).toEqual(["saved", "new"])
    expect(merged.defaultVoice).toBe("saved")
  })

  it("previews manually entered voice IDs without a catalog allowlist", () => {
    const draft = newTtsDraft()
    draft.credential = " draft-key "
    draft.voices = ["future-voice"]
    expect(previewInput(draft, draft.models[0], "future-voice")).toEqual(
      expect.objectContaining({
        credential: "draft-key",
        profile: expect.objectContaining({
          model: "gpt-4o-mini-tts",
          voices: ["future-voice"],
          defaultVoice: "future-voice",
        }),
      }),
    )
  })
})
