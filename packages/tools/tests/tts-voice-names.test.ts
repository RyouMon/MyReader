import { describe, expect, it } from "vitest"
import {
  characterVoiceLabel,
  ttsVoiceLabel,
  updateTtsVoiceNames,
} from "../src/tts-voice-names"

describe("voice display names", () => {
  it("distinguishes inherited settings, system speech and each model's named voices", () => {
    const profiles = [
      { id: "one", voiceNames: { A: "小樱" } },
      { id: "two", voiceNames: { A: "旁白" } },
    ]
    const labels = { defaultModel: "默认", system: "系统朗读" }
    const label = (voice: Parameters<typeof characterVoiceLabel>[0]) =>
      characterVoiceLabel(voice, profiles, labels, {
        systemVoices: [{ id: "os", name: "晓晓" }],
      })
    expect(label(null)).toBe("默认")
    expect(label(undefined)).toBe("默认")
    expect(label({ engine: "system", voiceId: "" })).toBe("系统朗读")
    expect(label({ engine: "system", voiceId: "os" })).toBe("晓晓")
    expect(label({ engine: "system", voiceId: "unavailable" })).toBe(
      "unavailable",
    )
    expect(label({ engine: "provider", profileId: "one", voiceId: "A" })).toBe(
      "小樱",
    )
    expect(label({ engine: "provider", profileId: "two", voiceId: "A" })).toBe(
      "旁白",
    )
    expect(label({ engine: "provider", profileId: "one", voiceId: "B" })).toBe(
      "B",
    )
  })

  it("falls back to the API ID when no name is set", () => {
    expect(ttsVoiceLabel("Cherry", { Cherry: "  小樱  " })).toBe("小樱")
    expect(ttsVoiceLabel("Cherry", { Cherry: " " })).toBe("Cherry")
    expect(ttsVoiceLabel("Cherry", undefined)).toBe("Cherry")
    expect(ttsVoiceLabel("Cherry", { Cherry: "小樱" }, "mul", "zh-CN")).toBe(
      "小樱 · 多语言",
    )
    expect(ttsVoiceLabel("Cherry", undefined, "zh", "en")).toBe(
      "Cherry · Chinese",
    )
    expect(ttsVoiceLabel("Cherry", undefined, "  ", "en")).toBe("Cherry")
    expect(
      characterVoiceLabel(
        { engine: "provider", voiceId: "Cherry", profileId: "p" },
        [{ id: "p", voiceNames: { Cherry: "小樱" } }],
        { defaultModel: "默认", system: "系统朗读" },
        {
          providerVoices: { p: [{ id: "Cherry", language: "mul" }] },
          locale: "zh",
        },
      ),
    ).toBe("小樱 · 多语言")
  })

  it("retains a row's name when its ID changes and removes deleted names", () => {
    const renamed = updateTtsVoiceNames(["old", "other"], ["new", "other"], {
      old: "Narrator",
      other: "Character",
    })
    expect(renamed).toEqual({ new: "Narrator", other: "Character" })
    expect(
      updateTtsVoiceNames(["new", "other"], ["other"], renamed, 0),
    ).toEqual({
      other: "Character",
    })
    expect(
      updateTtsVoiceNames(["other"], ["other", "discovered"], renamed),
    ).toEqual({
      other: "Character",
    })
  })
})

it("keeps names independent when entering names before IDs or removing empty rows", () => {
  const names = { ["\0" + "0"]: "First", ["\0" + "1"]: "Second" }
  expect(updateTtsVoiceNames(["", ""], ["Cherry", ""], names)).toEqual({
    Cherry: "First",
    ["\0" + "1"]: "Second",
  })
  expect(updateTtsVoiceNames(["", ""], [""], names, 0)).toEqual({
    ["\0" + "0"]: "Second",
  })
})
