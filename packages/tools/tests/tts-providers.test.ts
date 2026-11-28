import { expect, it } from "vitest"
import {
  hasEffectiveTtsCredential,
  isChinaMainlandRegion,
  isTtsCredentialRequiredError,
  isTtsProviderKind,
  mergeDiscoveredTtsVoices,
  TTS_PROVIDER_KINDS,
  ttsDefaultEndpoint,
  ttsEndpointSuggestions,
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

it("detects Mainland China region by explicit regionCode, timezone, and locale fallback", () => {
  expect(
    isChinaMainlandRegion({ regionCode: "CN", timeZone: "America/New_York" }),
  ).toBe(true)
  expect(
    isChinaMainlandRegion({
      regionCode: "US",
      timeZone: "Asia/Shanghai",
      locale: "zh-CN",
    }),
  ).toBe(false)
  expect(isChinaMainlandRegion({ regionCode: "TW" })).toBe(false)
  expect(
    isChinaMainlandRegion({ timeZone: "Asia/Shanghai", locale: "en-US" }),
  ).toBe(true)
  expect(
    isChinaMainlandRegion({ timeZone: "Asia/Urumqi", locale: "en-US" }),
  ).toBe(true)
  expect(
    isChinaMainlandRegion({ timeZone: "America/Los_Angeles", locale: "zh-CN" }),
  ).toBe(false)
  expect(
    isChinaMainlandRegion({ timeZone: "Asia/Singapore", locale: "zh-CN" }),
  ).toBe(false)
  expect(isChinaMainlandRegion({ timeZone: "UTC", locale: "zh-CN" })).toBe(true)
  expect(isChinaMainlandRegion({ timeZone: "UTC", locale: "zh-Hans-CN" })).toBe(
    true,
  )
  expect(isChinaMainlandRegion({ timeZone: "UTC", locale: "en-US" })).toBe(
    false,
  )
  expect(isChinaMainlandRegion({})).toBe(false)
})

it("selects region-appropriate defaults and ordered suggestions for Qwen and MiniMax", () => {
  expect(ttsDefaultEndpoint("qwen", true)).toBe(
    "https://dashscope.aliyuncs.com/api/v1",
  )
  expect(ttsDefaultEndpoint("qwen", false)).toBe(
    "https://dashscope-intl.aliyuncs.com/api/v1",
  )
  expect(ttsDefaultEndpoint("miniMax", true)).toBe("https://api.minimaxi.com")
  expect(ttsDefaultEndpoint("miniMax", false)).toBe("https://api.minimax.io")
  expect(ttsDefaultEndpoint("elevenLabs", true)).toBe(
    "https://api.elevenlabs.io",
  )

  expect(
    ttsEndpointSuggestions("miniMax", true).map((item) => item.url),
  ).toEqual(["https://api.minimaxi.com", "https://api.minimax.io"])
  expect(
    ttsEndpointSuggestions("miniMax", false).map((item) => item.url),
  ).toEqual(["https://api.minimax.io", "https://api.minimaxi.com"])

  expect(ttsEndpointSuggestions("qwen", true).map((item) => item.url)).toEqual([
    "https://dashscope.aliyuncs.com/api/v1",
    "https://dashscope-intl.aliyuncs.com/api/v1",
    "https://maas.qianwenaiapi.com/api/v1",
    "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference",
  ])
  expect(ttsEndpointSuggestions("qwen", false).map((item) => item.url)).toEqual(
    [
      "https://dashscope-intl.aliyuncs.com/api/v1",
      "https://dashscope.aliyuncs.com/api/v1",
      "https://maas.qianwenaiapi.com/api/v1",
      "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference",
    ],
  )
  expect(
    ttsEndpointSuggestions("openAiCompatible", true).map((item) => item.url),
  ).toEqual(["https://api.openai.com/v1"])
})

it("distinguishes missing TTS credentials from invalid credentials or unrelated errors", () => {
  const emptyDraft = {
    credential: "",
    hasCredential: false,
    clearCredential: false,
  }
  const savedDraft = {
    credential: "",
    hasCredential: true,
    clearCredential: false,
  }
  const clearedSavedDraft = {
    credential: "",
    hasCredential: true,
    clearCredential: true,
  }
  const typedDraft = {
    credential: "sk-invalid",
    hasCredential: false,
    clearCredential: false,
  }

  expect(hasEffectiveTtsCredential(emptyDraft)).toBe(false)
  expect(hasEffectiveTtsCredential(savedDraft)).toBe(true)
  expect(hasEffectiveTtsCredential(clearedSavedDraft)).toBe(false)
  expect(hasEffectiveTtsCredential(typedDraft)).toBe(true)

  expect(
    isTtsCredentialRequiredError(
      {
        kind: "Credential",
        message:
          "CREDENTIAL_ERROR: TTS_ERROR: unauthorized:TTS_CREDENTIAL_REQUIRED",
      },
      savedDraft,
      "Credential",
    ),
  ).toBe(true)
  expect(
    isTtsCredentialRequiredError(
      { kind: "Credential", message: "HTTP_401: Unauthorized" },
      emptyDraft,
      "Credential",
    ),
  ).toBe(true)
  expect(
    isTtsCredentialRequiredError(
      { kind: "Credential", message: "HTTP_401: Invalid API key" },
      typedDraft,
      "Credential",
    ),
  ).toBe(false)
  expect(
    isTtsCredentialRequiredError(
      { kind: "Storage", message: "network timeout" },
      emptyDraft,
      "Storage",
    ),
  ).toBe(false)
})
