import {
  mergeVoices,
  newTtsDraft,
  newTtsModel,
  previewInput,
  setVoiceScope,
  updateVoices,
} from "./tts-provider-draft"

describe("TTS provider drafts", () => {
  it("preserves voice IDs and names when changing voice scope", () => {
    const draft = newTtsDraft()
    draft.voices = ["gentle", "bright"]
    draft.voiceNames = { gentle: "Narrator" }
    draft.models = [newTtsModel("first"), newTtsModel("second")]
    const scoped = setVoiceScope(draft, true)
    expect(scoped.models.map((model) => model.voices)).toEqual([
      draft.voices,
      draft.voices,
    ])
    const shared = setVoiceScope(scoped, false)
    expect(shared.voices).toEqual(draft.voices)
    expect(shared.voiceNames).toEqual({ gentle: "Narrator" })
  })

  it("edits only the selected model's voice list in model-scoped mode", () => {
    const draft = newTtsDraft()
    draft.modelScopedVoices = true
    draft.models = [
      {
        ...newTtsModel("first"),
        id: "first",
        voices: ["old", "other"],
      },
      { ...newTtsModel("second"), id: "second", instructions: "Quiet" },
    ]
    const renamed = updateVoices(draft, draft.models[0]!.id, ["new", "other"])
    expect(renamed.models[0]!.voices).toEqual(["new", "other"])
    expect(renamed.models[1]).toEqual(draft.models[1])
    const removed = updateVoices(renamed, draft.models[0]!.id, ["other"])
    expect(removed.models[0]!.voices).toEqual(["other"])
  })

  it("appends newly discovered voices without duplicating saved IDs", () => {
    const model = {
      ...newTtsModel("custom-model"),
      voices: ["saved"],
    }
    const merged = mergeVoices(model, [
      { id: "saved", language: "en" },
      { id: "new", language: "zh" },
    ])
    expect(merged.voices).toEqual(["saved", "new"])
  })

  it("previews manually entered voice IDs without a catalog allowlist", () => {
    const draft = newTtsDraft()
    draft.credential = " draft-key "
    draft.voices = ["future-voice"]
    expect(previewInput(draft, draft.models[0])).toEqual(
      expect.objectContaining({
        credential: "draft-key",
        profile: expect.objectContaining({
          model: "gpt-4o-mini-tts",
          voices: ["future-voice"],
        }),
      }),
    )
  })

  it.each([
    ["miniMax", "MiniMax", "https://api.minimaxi.com/v1", "speech-2.8-turbo"],
    [
      "volcengine",
      "火山引擎",
      "https://openspeech.bytedance.com",
      "volcano_tts",
    ],
    ["doubao", "豆包语音", "https://openspeech.bytedance.com", "seed-tts-2.0"],
    [
      "elevenLabs",
      "ElevenLabs",
      "https://api.elevenlabs.io",
      "eleven_multilingual_v2",
    ],
    ["fishAudio", "Fish Audio", "https://api.fish.audio", "s2.1-pro-free"],
  ] as const)("uses the built-in %s provider defaults", (kind, name, endpoint, model) => {
    expect(newTtsDraft(kind)).toEqual(
      expect.objectContaining({
        kind,
        name,
        endpoint,
        modelScopedVoices: ["volcengine", "doubao"].includes(kind),
        models: [expect.objectContaining({ model })],
      }),
    )
  })
})
