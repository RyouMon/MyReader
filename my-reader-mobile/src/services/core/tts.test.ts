import {
  ttsGetConfig,
  ttsDiscoverQwenVoices,
  ttsQwenModels,
  ttsQwenPresets,
  ttsRemoveProfile,
  ttsSynthesize,
  ttsUpsertProfile,
} from "my-reader-core"
import {
  deleteTtsCredential,
  readTtsCredential,
  writeTtsCredential,
} from "../storage/credentials"
import {
  getTtsConfig,
  discoverQwenTtsVoices,
  getQwenTtsModels,
  getQwenTtsPresets,
  removeTtsProfile,
  synthesizeTts,
  type TtsConfig,
  upsertTtsProfile,
} from "./tts"

jest.mock("expo-file-system", () => ({
  Directory: jest.fn(() => ({ uri: "file:///cache/tts" })),
  File: jest.fn(() => ({ uri: "file:///documents/config.json" })),
  Paths: { cache: "file:///cache", document: "file:///documents" },
}))
jest.mock("../fs/path", () => ({
  toNativeFilesystemPath: (uri: string) => uri.replace("file://", ""),
}))
jest.mock("../storage/credentials", () => ({
  deleteTtsCredential: jest.fn(),
  readTtsCredential: jest.fn(),
  ttsCredentialReference: (id: string) => `ryoumon.myreader.tts.${id}`,
  writeTtsCredential: jest.fn(),
}))
jest.mock("my-reader-core", () => ({
  appConfigInitialize: jest.fn(),
  appConfigWriteMobile: jest.fn(),
  dataSourcePrepareForUpsert: jest.fn(),
  dataSourceRemove: jest.fn(),
  dataSourceUpsert: jest.fn(),
  libraryAddLocal: jest.fn(),
  libraryCreateLocalMyreader: jest.fn(),
  libraryCreateManagedLocalMyreader: jest.fn(),
  libraryOpenLocalMyreader: jest.fn(),
  libraryRemove: jest.fn(),
  libraryReplace: jest.fn(),
  librarySwitch: jest.fn(),
  ttsGetConfig: jest.fn(),
  ttsDiscoverQwenVoices: jest.fn(),
  ttsQwenModels: jest.fn(),
  ttsQwenPresets: jest.fn(),
  ttsListVoices: jest.fn(),
  ttsProbeProvider: jest.fn(),
  ttsProviderCapabilities: jest.fn(),
  ttsRemoveProfile: jest.fn(),
  ttsSetPlayback: jest.fn(),
  ttsSetVoice: jest.fn(),
  ttsSynthesize: jest.fn(),
  ttsUpsertProfile: jest.fn(),
}))

const systemConfig: TtsConfig = {
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
}

const openAiProfile = {
  id: "openai",
  name: "OpenAI",
  kind: "openAiCompatible",
  enabled: true,
  endpoint: "https://api.openai.com/v1",
  model: "gpt-4o-mini-tts",
  credentialReference: "ryoumon.myreader.tts.openai",
  responseFormat: "mp3",
  voices: ["reader-voice"],
  defaultVoice: "reader-voice",
  revision: 1,
}

describe("mobile core TTS", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("uses the shared Core creation presets without duplicating endpoints", () => {
    jest.mocked(ttsQwenPresets).mockReturnValue([])
    expect(getQwenTtsPresets()).toEqual([])
    expect(ttsQwenPresets).toHaveBeenCalledWith()
  })

  it("delegates endpoint-specific model availability to shared Core", () => {
    jest.mocked(ttsQwenModels).mockReturnValue([])
    const endpoint =
      "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference"
    expect(getQwenTtsModels(endpoint)).toEqual([])
    expect(ttsQwenModels).toHaveBeenCalledWith(endpoint)
  })

  it("discovers Qwen voices using draft credentials without saving a provider", async () => {
    const controller = new AbortController()
    jest
      .mocked(ttsDiscoverQwenVoices)
      .mockResolvedValue([
        { id: "account-voice", name: "account-voice", language: "zh" },
      ])
    await expect(
      discoverQwenTtsVoices(
        {
          endpoint: "https://dashscope.aliyuncs.com/api/v1",
          model: "qwen3-tts-vc-2026-01-22",
          credential: " draft-secret ",
        },
        controller.signal,
      ),
    ).resolves.toEqual([
      { id: "account-voice", name: "account-voice", language: "zh" },
    ])
    expect(ttsDiscoverQwenVoices).toHaveBeenCalledWith(
      "https://dashscope.aliyuncs.com/api/v1",
      "qwen3-tts-vc-2026-01-22",
      "draft-secret",
      { signal: controller.signal },
    )
    expect(ttsUpsertProfile).not.toHaveBeenCalled()
    expect(writeTtsCredential).not.toHaveBeenCalled()
  })

  it("resolves an existing provider credential for voice discovery", async () => {
    jest.mocked(ttsGetConfig).mockResolvedValue({
      ...systemConfig,
      profiles: [{ ...openAiProfile, id: "qwen", kind: "qwen" }],
    })
    jest.mocked(readTtsCredential).mockResolvedValue("stored-secret")
    await discoverQwenTtsVoices({
      endpoint: "https://dashscope.aliyuncs.com/api/v1",
      model: "qwen3-tts-vc-2026-01-22",
      profileId: "qwen",
    })
    expect(ttsDiscoverQwenVoices).toHaveBeenCalledWith(
      "https://dashscope.aliyuncs.com/api/v1",
      "qwen3-tts-vc-2026-01-22",
      "stored-secret",
      undefined,
    )
  })

  it("hydrates only a credential presence flag", async () => {
    jest.mocked(ttsGetConfig).mockResolvedValue({
      ...systemConfig,
      profiles: [openAiProfile],
    })
    jest.mocked(readTtsCredential).mockResolvedValue("secret")

    await expect(getTtsConfig()).resolves.toMatchObject({
      profiles: [{ id: "openai", hasCredential: true }],
    })
  })

  it("rejects unsupported provider kinds before calling Core", async () => {
    await expect(
      upsertTtsProfile({
        profile: {
          name: "Unsupported",
          kind: "unsupported",
          enabled: true,
          endpoint: "http://127.0.0.1:5100",
          voices: [],
        },
      }),
    ).rejects.toThrow("TTS_PROVIDER_KIND_UNSUPPORTED: unsupported")
    expect(ttsUpsertProfile).not.toHaveBeenCalled()
  })

  it("persists a provider reference while keeping the secret in SecureStore", async () => {
    jest.mocked(ttsGetConfig).mockResolvedValue(systemConfig)
    jest
      .mocked(ttsUpsertProfile)
      .mockImplementation(async (_path, profile) => ({
        ...systemConfig,
        profiles: [profile],
      }))
    jest.mocked(readTtsCredential).mockResolvedValue("secret")

    await upsertTtsProfile({
      profile: {
        name: "OpenAI",
        kind: "openAiCompatible",
        enabled: true,
        endpoint: "https://api.openai.com/v1",
        model: "gpt-4o-mini-tts",
        responseFormat: "mp3",
        voices: ["reader-voice"],
        defaultVoice: "reader-voice",
      },
      credential: " secret ",
    })

    expect(ttsUpsertProfile).toHaveBeenCalledWith(
      "/documents/config.json",
      expect.objectContaining({
        credentialReference:
          "ryoumon.myreader.tts.a1b2c3d4-e5f6-4890-abcd-ef1234567890",
      }),
    )
    expect(writeTtsCredential).toHaveBeenCalledWith(
      "ryoumon.myreader.tts.a1b2c3d4-e5f6-4890-abcd-ef1234567890",
      "secret",
    )
    expect(
      JSON.stringify(jest.mocked(ttsUpsertProfile).mock.calls),
    ).not.toContain('"secret"')
  })

  it("passes a credential transiently when Core synthesizes cached audio", async () => {
    jest.mocked(ttsGetConfig).mockResolvedValue({
      ...systemConfig,
      profiles: [openAiProfile],
    })
    jest.mocked(readTtsCredential).mockResolvedValue("secret")
    jest.mocked(ttsSynthesize).mockResolvedValue({
      path: "/cache/tts/audio.mp3",
      mimeType: "audio/mpeg",
      timings: [],
    })

    const request = {
      profileId: "openai",
      text: "Hello",
      voiceId: "reader-voice",
      acceptedMimeTypes: ["audio/mpeg"],
      cachePolicy: "use",
    }
    const controller = new AbortController()
    await synthesizeTts(request, { signal: controller.signal })

    expect(ttsSynthesize).toHaveBeenCalledWith(
      "/documents/config.json",
      "/cache/tts",
      request,
      "secret",
      { signal: controller.signal },
    )
  })

  it("removes the SecureStore entry after Core removes a profile", async () => {
    jest.mocked(ttsGetConfig).mockResolvedValue({
      ...systemConfig,
      profiles: [openAiProfile],
    })
    jest.mocked(ttsRemoveProfile).mockResolvedValue(systemConfig)

    await removeTtsProfile("openai")

    expect(deleteTtsCredential).toHaveBeenCalledWith(
      "ryoumon.myreader.tts.openai",
    )
  })
})
