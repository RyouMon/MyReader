import type { MobileTtsConfig } from "@/src/services/core/tts"
import {
  buildReaderTtsEngineConfig,
  buildReaderTtsSynthesisRequest,
  chooseReaderTtsVoice,
  classifyReaderTtsError,
  resolveReaderTtsSelection,
} from "./reader-tts"

function config(overrides: Partial<MobileTtsConfig> = {}): MobileTtsConfig {
  return {
    schemaVersion: 1,
    defaultEngine: { kind: "system" },
    profiles: [],
    voices: [],
    playback: {
      speed: 1,
      pitch: 1,
      skipPageBreaks: true,
      skipFootnotes: false,
      announceContext: false,
    },
    ...overrides,
  }
}

describe("reader TTS selection", () => {
  it("should prefer an exact language voice and then the global fallback", () => {
    const systemConfig = config({
      voices: [
        {
          language: "und",
          engine: "system",
          voiceId: "global-system",
        },
        {
          language: "zh-CN",
          engine: "system",
          voiceId: "zh-system",
        },
      ],
    })

    expect(resolveReaderTtsSelection(systemConfig, "zh-CN")).toEqual({
      kind: "system",
      voiceId: "zh-system",
    })
    expect(resolveReaderTtsSelection(systemConfig, "zho")).toEqual({
      kind: "system",
      voiceId: "zh-system",
    })
    expect(resolveReaderTtsSelection(systemConfig, "fr-FR")).toEqual({
      kind: "system",
      voiceId: "global-system",
    })
  })

  it("should keep provider voice identifiers scoped to their profile", () => {
    const provider = {
      id: "openai",
      name: "OpenAI",
      kind: "openAiCompatible",
      enabled: true,
      endpoint: "https://api.openai.com/v1",
      model: "gpt-4o-mini-tts",
      responseFormat: "mp3",
      voices: ["reader-voice", "narrator-voice"],
      defaultVoice: "reader-voice",
      revision: 1,
      hasCredential: true,
    }
    const providerConfig = config({
      defaultEngine: { kind: "provider", profileId: provider.id },
      profiles: [provider],
      voices: [
        {
          language: "und",
          engine: "provider",
          profileId: "another-provider",
          voiceId: "wrong",
        },
        {
          language: "und",
          engine: "provider",
          profileId: provider.id,
          voiceId: "narrator-voice",
        },
      ],
    })

    expect(resolveReaderTtsSelection(providerConfig, "en-US")).toEqual({
      kind: "provider",
      profile: provider,
      voiceId: "narrator-voice",
    })
  })

  it("should use the provider default when no language override exists", () => {
    const provider = {
      id: "openai",
      name: "OpenAI",
      kind: "openAiCompatible",
      enabled: true,
      endpoint: "https://api.example.test/v1",
      model: "speech-model",
      responseFormat: "mp3",
      voices: ["reader-voice", "narrator-voice"],
      defaultVoice: "narrator-voice",
      revision: 1,
      hasCredential: true,
    }
    const selection = resolveReaderTtsSelection(
      config({
        defaultEngine: { kind: "provider", profileId: provider.id },
        profiles: [provider],
      }),
      "en-US",
    )

    expect(selection).toEqual({
      kind: "provider",
      profile: provider,
      voiceId: "narrator-voice",
    })
  })

  it("should choose a deterministic provider voice for the publication language", () => {
    const voices = [
      { id: "reader-voice", name: "reader-voice", language: "mul" },
      { id: "zh", name: "Chinese", language: "zh-CN" },
    ]

    expect(chooseReaderTtsVoice(voices, "zh-CN")?.id).toBe("zh")
    expect(chooseReaderTtsVoice(voices, "fr-FR")?.id).toBe("reader-voice")
  })

  it("should canonicalize Calibre language codes before starting Readium TTS", () => {
    expect(
      buildReaderTtsEngineConfig(
        config(),
        { kind: "system", voiceId: "chinese" },
        "zho",
        "#C4622D",
      ),
    ).toEqual(
      expect.objectContaining({
        kind: "system",
        voiceId: "chinese",
        language: "zh",
      }),
    )
  })

  it("should build a cached remote synthesis request without unsupported pitch", () => {
    expect(
      buildReaderTtsSynthesisRequest(
        {
          profileId: "openai",
          text: "Hello",
          language: "en-US",
          voiceId: "reader-voice",
          speed: 1.2,
        },
        ["audio/mpeg"],
      ),
    ).toEqual({
      profileId: "openai",
      text: "Hello",
      language: "en-US",
      voiceId: "reader-voice",
      speed: 1.2,
      acceptedMimeTypes: ["audio/mpeg"],
      cachePolicy: "use",
    })
  })

  it("should turn a wrapped provider outage into an actionable error kind", () => {
    expect(
      classifyReaderTtsError(
        "engine(ReadiumNavigator.TTSError.other(PlaybackError(message: CORE_ERROR: TTS_ERROR: unavailable:TTS_PROVIDER_UNAVAILABLE)))",
      ),
    ).toEqual({ kind: "providerUnavailable" })
  })
})
