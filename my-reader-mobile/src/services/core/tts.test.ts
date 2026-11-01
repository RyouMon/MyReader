import {
  ttsGetConfig,
  ttsSaveProvider,
  ttsDiscoverQwenVoices,
  ttsQwenModels,
  ttsQwenPresets,
  ttsRemoveProfile,
  ttsSynthesize,
  ttsPreviewProvider,
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
  previewTtsProvider,
  type TtsConfig,
  upsertTtsProfile,
  saveTtsProvider,
} from "./tts"
import { queryClient } from "../query/query-client"
import { QueryObserver } from "@tanstack/react-query"

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
  ttsPreviewProvider: jest.fn(),
  ttsUpsertProfile: jest.fn(),
  ttsSaveProvider: jest.fn(),
}))

const systemConfig: TtsConfig = {
  schemaVersion: 2,
  providers: [],
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
  endpoint: "https://api.openai.com/v1",
  model: "gpt-4o-mini-tts",
  credentialReference: "ryoumon.myreader.tts.openai",
  responseFormat: "mp3",
  voices: ["reader-voice"],
  defaultVoice: "reader-voice",
  revision: 1,
}

// Use the same AbortController implementation as React Native, not Node's newer API.
const nodeRequire = require as typeof require & {
  resolve: (id: string, options?: { paths: string[] }) => string
}
const nativeAbort = jest.requireActual(
  nodeRequire.resolve("abort-controller/dist/abort-controller", {
    paths: [nodeRequire.resolve("react-native/package.json")],
  }),
) as Pick<typeof globalThis, "AbortController" | "AbortSignal">

describe("mobile core TTS", () => {
  const originalAbortController = globalThis.AbortController
  const originalAbortSignal = globalThis.AbortSignal

  beforeAll(() => {
    globalThis.AbortController = nativeAbort.AbortController
    globalThis.AbortSignal = nativeAbort.AbortSignal
  })

  afterAll(() => {
    globalThis.AbortController = originalAbortController
    globalThis.AbortSignal = originalAbortSignal
  })

  beforeEach(() => {
    jest.clearAllMocks()
    queryClient.clear()
  })

  it.each([
    "save",
    "delete",
  ])("refreshes cached character settings after provider %s", async (action) => {
    const key = ["book-narration", "library", 1]
    const before = {
      revision: 1,
      characters: [{ id: "alice", voice: { profileId: "removed" } }],
    }
    const after = { revision: 2, characters: [{ id: "alice", voice: null }] }
    queryClient.setQueryData(key, before)
    const observer = new QueryObserver(queryClient, {
      queryKey: key,
      queryFn: async () => after,
    })
    const unsubscribe = observer.subscribe(() => {})
    jest.mocked(ttsGetConfig).mockResolvedValue(systemConfig)
    jest.mocked(ttsSaveProvider).mockResolvedValue(systemConfig)
    jest.mocked(ttsRemoveProfile).mockResolvedValue(systemConfig)
    if (action === "save") {
      await saveTtsProvider({
        provider: {
          id: "provider",
          name: "Provider",
          kind: "qwen",
          endpoint: "https://tts.example",
          modelScopedVoices: true,
          models: [],
          voices: [],
        },
      })
    } else await removeTtsProfile("provider")
    expect(queryClient.getQueryData(key)).toEqual(after)
    unsubscribe()
    queryClient.clear()
  })

  it.each([
    [undefined, false, "saved-key"],
    [" draft-key ", false, "draft-key"],
    ["draft-key", true, undefined],
  ])("tests draft credentials %s (clear %s) without saving", async (credential, clearCredential, expected) => {
    jest.mocked(ttsGetConfig).mockResolvedValue({
      ...systemConfig,
      profiles: [openAiProfile],
      providers: [
        {
          modelScopedVoices: false,

          ...openAiProfile,
          models: [
            {
              id: openAiProfile.id,
              model: openAiProfile.model,

              responseFormat: "mp3",
              defaultVoice: "reader-voice",
              voices: [],
            },
          ],
        },
      ],
    })
    jest.mocked(readTtsCredential).mockResolvedValue("saved-key")
    jest.mocked(ttsPreviewProvider).mockResolvedValue({
      path: "/cache/tts/test.wav",
      mimeType: "audio/wav",
      timings: [],
    })
    const signal = new AbortController().signal
    await previewTtsProvider(
      {
        profile: { ...openAiProfile, endpoint: "https://draft.example/v1" },
        credential,
        clearCredential,
      },
      "Test",
      signal,
    )
    expect(ttsPreviewProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://draft.example/v1",
        credentialReference: undefined,
      }),
      "/cache/tts",
      "Test",
      expected,
      { signal },
    )
    expect(ttsUpsertProfile).not.toHaveBeenCalled()
    expect(writeTtsCredential).not.toHaveBeenCalled()
    expect(deleteTtsCredential).not.toHaveBeenCalled()
  })

  it("uses the shared Core creation presets without duplicating endpoints", () => {
    jest.mocked(ttsQwenPresets).mockReturnValue([])
    expect(getQwenTtsPresets()).toEqual([])
    expect(ttsQwenPresets).toHaveBeenCalledWith()
  })

  it("delegates authenticated model discovery to shared Core", async () => {
    jest.mocked(ttsQwenModels).mockResolvedValue([])
    const endpoint =
      "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference"
    expect(
      await getQwenTtsModels({ endpoint, credential: "draft-key" }),
    ).toEqual([])
    expect(ttsQwenModels).toHaveBeenCalledWith(endpoint, "draft-key", undefined)
  })

  it("discovers Qwen voices using draft credentials without saving a provider", async () => {
    const controller = new AbortController()
    jest
      .mocked(ttsDiscoverQwenVoices)
      .mockResolvedValue([{ id: "account-voice", language: "zh" }])
    await expect(
      discoverQwenTtsVoices(
        {
          endpoint: "https://dashscope.aliyuncs.com/api/v1",
          model: "qwen3-tts-vc-2026-01-22",
          credential: " draft-secret ",
        },
        controller.signal,
      ),
    ).resolves.toEqual([{ id: "account-voice", language: "zh" }])
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
      providers: [
        {
          modelScopedVoices: false,

          ...openAiProfile,
          id: "qwen",
          kind: "qwen",
          models: [
            {
              id: "qwen-model",
              model: "qwen3-tts-vc-2026-01-22",

              responseFormat: "wav",
              voices: [],
            },
          ],
        },
      ],
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
      providers: [
        {
          modelScopedVoices: false,

          ...openAiProfile,
          models: [
            {
              id: openAiProfile.id,
              model: openAiProfile.model,

              responseFormat: "mp3",
              defaultVoice: "reader-voice",
              voices: [],
            },
          ],
        },
      ],
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
      providers: [
        {
          modelScopedVoices: false,

          ...openAiProfile,
          models: [
            {
              id: openAiProfile.id,
              model: openAiProfile.model,

              responseFormat: "mp3",
              defaultVoice: "reader-voice",
              voices: [],
            },
          ],
        },
      ],
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
      { signal: expect.any(AbortSignal) },
    )
  })

  it("times out credential loading and never dispatches synthesis after the deadline", async () => {
    jest.useFakeTimers()
    try {
      jest.mocked(ttsGetConfig).mockResolvedValue({
        ...systemConfig,
        profiles: [openAiProfile],
        providers: [
          {
            modelScopedVoices: false,

            ...openAiProfile,
            models: [
              {
                id: openAiProfile.id,
                model: openAiProfile.model,

                responseFormat: "mp3",
                defaultVoice: "reader-voice",
                voices: [],
              },
            ],
          },
        ],
      })
      let resolveCredential!: (value: string) => void
      jest.mocked(readTtsCredential).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveCredential = resolve
        }),
      )
      const pending = synthesizeTts({
        profileId: "openai",
        text: "Hello",
        voiceId: "reader-voice",
        acceptedMimeTypes: ["audio/mpeg"],
        cachePolicy: "use",
      })
      const assertion = expect(pending).rejects.toThrow("TTS_REQUEST_TIMEOUT")
      await jest.advanceTimersByTimeAsync(20_000)
      await assertion
      resolveCredential("secret")
      await jest.advanceTimersByTimeAsync(0)
      expect(ttsSynthesize).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it("cancels during credential loading without dispatching late synthesis", async () => {
    jest.mocked(ttsGetConfig).mockResolvedValue({
      ...systemConfig,
      profiles: [openAiProfile],
      providers: [
        {
          modelScopedVoices: false,

          ...openAiProfile,
          models: [
            {
              id: openAiProfile.id,
              model: openAiProfile.model,

              responseFormat: "mp3",
              defaultVoice: "reader-voice",
              voices: [],
            },
          ],
        },
      ],
    })
    let resolveCredential!: (value: string) => void
    jest.mocked(readTtsCredential).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCredential = resolve
      }),
    )
    const controller = new AbortController()
    const pending = synthesizeTts(
      {
        profileId: "openai",
        text: "Hello",
        voiceId: "reader-voice",
        acceptedMimeTypes: ["audio/mpeg"],
        cachePolicy: "use",
      },
      { signal: controller.signal },
    )
    const assertion = expect(pending).rejects.toMatchObject({
      name: "AbortError",
      message: "TTS_SYNTHESIS_CANCELLED",
    })
    await Promise.resolve()
    expect(readTtsCredential).toHaveBeenCalled()
    controller.abort()
    await assertion
    resolveCredential("secret")
    await Promise.resolve()
    await Promise.resolve()
    expect(ttsSynthesize).not.toHaveBeenCalled()
  })

  it("removes the SecureStore entry after Core removes a profile", async () => {
    jest.mocked(ttsGetConfig).mockResolvedValue({
      ...systemConfig,
      profiles: [openAiProfile],
      providers: [
        {
          modelScopedVoices: false,

          ...openAiProfile,
          models: [
            {
              id: openAiProfile.id,
              model: openAiProfile.model,

              responseFormat: "mp3",
              defaultVoice: "reader-voice",
              voices: [],
            },
          ],
        },
      ],
    })
    jest.mocked(ttsRemoveProfile).mockResolvedValue(systemConfig)

    await removeTtsProfile("openai")

    expect(deleteTtsCredential).toHaveBeenCalledWith(
      "ryoumon.myreader.tts.openai",
    )
  })
})
