import { expect, it } from "vitest"
import {
  isTtsProviderKind,
  mergeDiscoveredTtsVoices,
  TTS_PROVIDER_KINDS,
  ttsMaximumPlaybackSpeedForProfile,
  ttsProviderMeta,
  ttsUsesModelScopedVoices,
} from "../src/tts-providers"

it("declares metadata for every supported TTS provider kind", () => {
  expect(TTS_PROVIDER_KINDS).toEqual([
    "openAiCompatible",
    "qwen",
    "miniMax",
    "volcengine",
    "elevenLabs",
    "fishAudio",
    "gemini",
  ])
  for (const kind of TTS_PROVIDER_KINDS) {
    expect(isTtsProviderKind(kind)).toBe(true)
    expect(ttsProviderMeta(kind).kind).toBe(kind)
  }
  expect(isTtsProviderKind("unknown")).toBe(false)
})

it("enforces model-scoped voices for Qwen and Volcengine while keeping others configurable or shared", () => {
  expect(ttsUsesModelScopedVoices({ kind: "qwen" })).toBe(true)
  expect(ttsUsesModelScopedVoices({ kind: "volcengine" })).toBe(true)
  expect(ttsUsesModelScopedVoices({ kind: "miniMax" })).toBe(false)
  expect(
    ttsUsesModelScopedVoices({
      kind: "openAiCompatible",
      modelScopedVoices: true,
    }),
  ).toBe(true)
})

it("caps mobile playback speed for normal-speed-only models", () => {
  expect(
    ttsMaximumPlaybackSpeedForProfile({
      kind: "qwen",
      model: "qwen3-tts-flash",
    }),
  ).toBe(2)
  expect(
    ttsMaximumPlaybackSpeedForProfile({
      kind: "elevenLabs",
      model: "eleven_v3",
    }),
  ).toBe(2)
  expect(
    ttsMaximumPlaybackSpeedForProfile({
      kind: "elevenLabs",
      model: "eleven_multilingual_v2",
    }),
  ).toBe(3)
  expect(
    ttsMaximumPlaybackSpeedForProfile({
      kind: "gemini",
      model: "gemini-2.5-flash-preview-tts",
    }),
  ).toBe(2)
  expect(
    ttsMaximumPlaybackSpeedForProfile({
      kind: "miniMax",
      model: "speech-2.8-turbo",
    }),
  ).toBe(3)
})

it("merges discovered voices and populates display names without overwriting user aliases", () => {
  const merged = mergeDiscoveredTtsVoices(["v1", ""], { v1: "Custom Alias" }, [
    { id: "v1", name: "Upstream Name" },
    { id: "v2", name: "晓晓" },
    { id: "v3", name: null },
  ])
  expect(merged.voices).toEqual(["v1", "v2", "v3"])
  expect(merged.voiceNames).toEqual({
    v1: "Custom Alias",
    v2: "晓晓",
  })
})
