import "@/i18n"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactElement } from "react"
function render(ui: ReactElement) {
  return renderView(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {ui}
    </QueryClientProvider>,
  )
}
import {
  fireEvent,
  render as renderView,
  screen,
  within,
  waitFor,
} from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"

import type {
  QwenTtsPresetDto,
  QwenTtsModelDto,
  TtsConfigDto,
} from "@/lib/tauri-specta"
import SpeechSection, { TtsProvidersSection } from "../SpeechSection"

const mocks = vi.hoisted(() => ({
  getTtsConfig: vi.fn(),
  discoverTtsModels: vi.fn(),
  listQwenTtsModels: vi.fn(),
  listQwenTtsPresets: vi.fn(),
  discoverQwenTtsVoices: vi.fn(),
  saveTtsProvider: vi.fn(),
  testTtsProvider: vi.fn(),
  cancelTtsSynthesis: vi.fn(),
  notifyTtsConfigChanged: vi.fn(),
}))

vi.mock("@/lib/tauri-api", () => ({
  api: {
    getTtsConfig: mocks.getTtsConfig,
    discoverTtsModels: mocks.discoverTtsModels,
    listQwenTtsModels: mocks.listQwenTtsModels,
    listQwenTtsPresets: mocks.listQwenTtsPresets,
    discoverQwenTtsVoices: mocks.discoverQwenTtsVoices,
    saveTtsProvider: mocks.saveTtsProvider,
    testTtsProvider: mocks.testTtsProvider,
    cancelTtsSynthesis: mocks.cancelTtsSynthesis,
  },
  formatApiError: (error: unknown) => String(error),
}))

vi.mock("@/lib/tts/events", () => ({
  notifyTtsConfigChanged: mocks.notifyTtsConfigChanged,
}))

const config: TtsConfigDto = {
  schemaVersion: 2,
  providers: [],
  defaultEngine: { kind: "system" },
  profiles: [],
  voiceByLanguage: {},
  playback: {
    speed: 1,
    pitch: 1,
    skipPageBreaks: true,
    skipFootnotes: true,
    announceContext: false,
  },
}

const presets: (QwenTtsPresetDto & { defaultModel: QwenTtsModelDto })[] = [
  ["tokenPlan", "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference"],
  ["qianwen", "https://maas.qianwenaiapi.com/api/v1"],
  ["dashscope", "https://dashscope.aliyuncs.com/api/v1"],
].map(([id, endpoint]) => ({
  id,
  endpoint,
  defaultModel: {
    id: "qwen-audio-3.0-tts-plus",
    name: "Qwen-Audio-TTS Plus",
    audioFormats: ["mp3", "wav", "opus"],
    supportsInstructions: true,
    voiceDiscovery: id !== "tokenPlan",
    voices: [],
  },
}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    "Audio",
    class {
      onended: (() => void) | null = null
      onerror = null
      pause() {}
      async play() {
        this.onended?.()
      }
    },
  )
  mocks.testTtsProvider.mockResolvedValue({ path: "/tmp/preview.mp3" })
  mocks.cancelTtsSynthesis.mockResolvedValue(undefined)
  mocks.discoverTtsModels.mockResolvedValue([])
  vi.stubGlobal("ResizeObserver", ResizeObserverMock)
  HTMLElement.prototype.scrollIntoView = vi.fn()
  mocks.getTtsConfig.mockResolvedValue(config)
  mocks.listQwenTtsPresets.mockResolvedValue(
    presets.map(({ id, endpoint }) => ({ id, endpoint })),
  )
  mocks.listQwenTtsModels.mockImplementation(
    async ({ profile: { endpoint } }) =>
      presets
        .filter((preset) => preset.endpoint === endpoint)
        .map((preset) => preset.defaultModel),
  )
  mocks.discoverQwenTtsVoices.mockImplementation(async () => [
    { id: "custom-voice", name: "Custom voice", language: "mul", gender: null },
  ])
  mocks.saveTtsProvider.mockResolvedValue(config)
})

async function importQwenModel(name: RegExp = /Qwen-Audio-TTS Plus/) {
  fireEvent.click(screen.getByRole("button", { name: "获取可用模型" }))
  fireEvent.click(await screen.findByRole("checkbox", { name }))
  fireEvent.click(screen.getByRole("button", { name: "添加所选模型" }))
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "添加所选模型" }),
    ).not.toBeInTheDocument(),
  )
}

describe("SpeechSection", () => {
  it.each([
    [0, "Qwen · Token Plan", "Token Plan 套餐密钥（sk-sp- 开头）"],
    [1, "Qwen · 按需计费", "千问 AI 平台 API Key（非套餐密钥）"],
    [2, "Qwen · DashScope（百炼）", "阿里云百炼 API Key（与服务地域一致）"],
  ] as const)("creates and reopens Qwen source %s without changing its endpoint", async (index, title, placeholder) => {
    const user = userEvent.setup()
    const preset = presets[index]
    mocks.saveTtsProvider.mockImplementation(async ({ provider }) => ({
      ...config,
      providers: [{ ...provider, id: "saved-qwen", hasCredential: true }],
    }))
    render(<TtsProvidersSection />)
    await user.click(
      await screen.findByRole("button", { name: "添加语音服务" }),
    )
    await user.click(
      await screen.findByRole("button", {
        name: (name) => name.startsWith(title),
      }),
    )
    const form = within(screen.getByRole("dialog"))
    expect(form.getByLabelText("名称")).toHaveValue(title)
    expect(form.getByLabelText("服务器地址")).toHaveValue(preset.endpoint)
    await user.type(form.getByPlaceholderText(placeholder), "fixture-key")
    expect(mocks.listQwenTtsModels).not.toHaveBeenCalled()
    await importQwenModel()
    if (index === 0) {
      fireEvent.click(form.getByRole("button", { name: "添加声音" }))
      fireEvent.change(form.getByLabelText("声音 ID"), {
        target: { value: "manual-voice" },
      })
    }
    expect(mocks.listQwenTtsModels).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({ endpoint: preset.endpoint }),
        credential: "fixture-key",
      }),
    )
    await user.click(form.getByRole("button", { name: "添加语音服务" }))
    await waitFor(() =>
      expect(mocks.saveTtsProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.objectContaining({
            kind: "qwen",
            name: title,
            endpoint: preset.endpoint,
            models: [
              expect.objectContaining({
                model: preset.defaultModel.id,
                responseFormat: "mp3",
                defaultVoice: index === 0 ? "manual-voice" : "custom-voice",
              }),
            ],
          }),
        }),
      ),
    )
    await user.click(
      await screen.findByRole("button", { name: "编辑语音服务" }),
    )
    expect(
      within(screen.getByRole("dialog")).getByLabelText("服务器地址"),
    ).toHaveValue(preset.endpoint)
  })

  it("clears draft credentials and voices when returning to choose another Qwen source", async () => {
    const user = userEvent.setup()
    render(<TtsProvidersSection />)
    await user.click(
      await screen.findByRole("button", { name: "添加语音服务" }),
    )
    await user.click(
      await screen.findByRole("button", { name: /^Qwen · Token Plan/ }),
    )
    await user.type(
      screen.getByLabelText("API 密钥或访问令牌"),
      "sk-sp-fixture",
    )
    await importQwenModel()
    await user.click(screen.getByRole("button", { name: "添加声音" }))
    await user.type(screen.getByLabelText("声音 ID"), "subscription-voice")
    await user.click(screen.getByRole("button", { name: "返回" }))
    await user.click(screen.getByRole("button", { name: /^Qwen · 按需计费/ }))
    expect(screen.getByLabelText("API 密钥或访问令牌")).toHaveValue("")
    expect(screen.queryByLabelText("声音 ID")).not.toBeInTheDocument()
    await importQwenModel()
    expect(screen.getByLabelText("声音 ID")).toHaveValue("custom-voice")
    await user.click(screen.getByRole("button", { name: "添加声音" }))
    expect(screen.getAllByLabelText("声音 ID")[1]).toHaveValue("")
    expect(screen.getByLabelText("服务器地址")).toHaveValue(presets[1].endpoint)
  })

  it("imports Token Plan models without built-in voices and accepts manually supplied voice IDs", async () => {
    render(<TtsProvidersSection />)
    await screen.findByRole("heading", { name: "TTS 供应商" })
    fireEvent.click(screen.getByRole("button", { name: "添加语音服务" }))
    const choice = await screen.findByRole("button", {
      name: /^Qwen · Token Plan/,
    })
    await waitFor(() => expect(choice).toBeEnabled())
    fireEvent.click(choice)
    await importQwenModel()
    const form = within(screen.getByRole("dialog"))
    expect(form.getByLabelText("模型 ID")).toHaveValue(
      "qwen-audio-3.0-tts-plus",
    )
    expect(form.queryByLabelText("音频格式")).not.toBeInTheDocument()
    expect(form.queryByLabelText("声音 ID")).not.toBeInTheDocument()
    expect(form.queryByLabelText("默认声音")).not.toBeInTheDocument()
    expect(form.queryByLabelText("默认朗读指令")).not.toBeInTheDocument()
    expect(form.getByLabelText("服务器地址")).toHaveValue(
      "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference",
    )
    fireEvent.change(form.getByLabelText("API 密钥或访问令牌"), {
      target: { value: "sk-sp-fixture" },
    })
    expect(mocks.discoverQwenTtsVoices).not.toHaveBeenCalled()
    fireEvent.click(form.getByRole("button", { name: "添加声音" }))
    fireEvent.change(form.getByLabelText("声音 ID"), {
      target: { value: "future-voice" },
    })
    fireEvent.click(form.getByRole("button", { name: "测试 future-voice" }))
    await waitFor(() =>
      expect(mocks.testTtsProvider).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          profile: expect.objectContaining({
            options: expect.objectContaining({ defaultVoice: "future-voice" }),
          }),
        }),
        expect.any(String),
      ),
    )
    fireEvent.click(form.getByRole("button", { name: "添加语音服务" }))
    await waitFor(() =>
      expect(mocks.saveTtsProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.objectContaining({
            kind: "qwen",
            endpoint:
              "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference",
            models: [
              expect.objectContaining({
                model: "qwen-audio-3.0-tts-plus",
                responseFormat: "mp3",
                defaultVoice: "future-voice",
                voices: ["future-voice"],
              }),
            ],
          }),
        }),
      ),
    )
  })

  it("automatically uses WAV when the selected Qwen model only supports WAV", async () => {
    mocks.listQwenTtsModels.mockResolvedValue([
      presets[2].defaultModel,
      {
        id: "qwen3-tts-flash",
        name: "Qwen3-TTS Flash",
        audioFormats: ["wav"],
        supportsInstructions: false,
        voiceDiscovery: false,
        voices: [],
      },
    ])
    render(<TtsProvidersSection />)
    fireEvent.click(await screen.findByRole("button", { name: "添加语音服务" }))
    fireEvent.click(
      await screen.findByRole("button", { name: /^Qwen · DashScope/ }),
    )
    await importQwenModel(/Qwen3-TTS Flash/)
    const form = within(screen.getByRole("dialog"))
    expect(mocks.discoverQwenTtsVoices).not.toHaveBeenCalled()
    fireEvent.click(form.getByRole("button", { name: "添加声音" }))
    fireEvent.change(form.getByLabelText("声音 ID"), {
      target: { value: "Cherry" },
    })
    expect(form.getByLabelText("声音 ID")).toHaveValue("Cherry")
    expect(form.queryByLabelText("音频格式")).not.toBeInTheDocument()
    fireEvent.click(form.getByRole("button", { name: "添加语音服务" }))
    await waitFor(() =>
      expect(mocks.saveTtsProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.objectContaining({
            models: [
              expect.objectContaining({
                model: "qwen3-tts-flash",
                responseFormat: "wav",
                defaultVoice: "Cherry",
              }),
            ],
          }),
        }),
      ),
    )
  })
  it("keeps preview, defaults, and provider management as separate controls", async () => {
    mocks.getTtsConfig.mockResolvedValue({
      ...config,
      defaultEngine: { kind: "provider", profileId: "openai" },
      profiles: [
        {
          id: "openai",
          name: "My voice service",
          kind: "openAiCompatible",
          enabled: true,
          endpoint: "https://example.com/v1",
          model: "tts-model",
          options: {
            kind: "openAiCompatible",
            responseFormat: "mp3",
            voices: ["reader"],
            defaultVoice: "reader",
          },
          revision: 1,
          hasCredential: true,
        },
      ],
    })

    render(<SpeechSection />)

    await screen.findByRole("heading", { name: "朗读配置" })
    expect(screen.getByText("欢迎使用 MyReader 朗读功能。")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "试听" })).toBeInTheDocument()
    expect(
      screen.getByRole("combobox", { name: "朗读引擎" }),
    ).toHaveTextContent("My voice service")
    expect(
      screen.getByRole("combobox", { name: "默认声音" }),
    ).toHaveTextContent("reader")
    expect(screen.getByRole("combobox", { name: "默认语速" })).toHaveAttribute(
      "data-slot",
      "select-trigger",
    )
    expect(screen.getByRole("combobox", { name: "默认音高" })).toHaveAttribute(
      "data-slot",
      "select-trigger",
    )
    expect(
      screen.queryByRole("combobox", { name: "默认音量" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("switch", { name: "自动跟随朗读位置" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: "TTS 供应商" }),
    ).not.toBeInTheDocument()
    expect(screen.getAllByText("My voice service/tts-model")).toHaveLength(1)
    expect(
      screen.queryByRole("button", { name: "测试并试听" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/隐私提示：系统朗读在本机处理/),
    ).not.toBeInTheDocument()
  })

  it("should add a provider through the standard dialog flow", async () => {
    render(<TtsProvidersSection />)

    await screen.findByRole("heading", { name: "TTS 供应商" })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "添加语音服务" }))

    const dialog = screen.getByRole("dialog")
    const flow = within(dialog)
    expect(
      flow.getByRole("heading", { name: "添加语音服务" }),
    ).toBeInTheDocument()
    expect(
      flow.getByRole("button", { name: "添加 OpenAI 兼容服务" }),
    ).toBeInTheDocument()

    fireEvent.click(flow.getByRole("button", { name: "添加 OpenAI 兼容服务" }))

    expect(screen.getByRole("dialog")).toBe(dialog)
    expect(
      flow.getByRole("heading", { name: "添加 OpenAI 兼容服务" }),
    ).toBeInTheDocument()
    expect(flow.getByRole("button", { name: "返回" })).toHaveAttribute(
      "data-variant",
      "ghost",
    )
    expect(flow.getByRole("button", { name: "关闭" })).toHaveAttribute(
      "data-variant",
      "ghost",
    )
    expect(flow.getByLabelText("服务器地址")).toHaveValue(
      "https://api.openai.com/v1",
    )
    expect(flow.queryByLabelText("音频格式")).not.toBeInTheDocument()
    expect(flow.queryByLabelText("默认声音")).not.toBeInTheDocument()
    expect(flow.queryByLabelText("默认朗读指令")).not.toBeInTheDocument()
    expect(flow.queryByRole("button", { name: "测试" })).not.toBeInTheDocument()
    expect(
      flow.queryByText("服务地址需精确填写到 /v1 层级。"),
    ).not.toBeInTheDocument()
    expect(
      flow.queryByRole("button", { name: /模型设置/ }),
    ).not.toBeInTheDocument()
    expect(
      flow.getByRole("button", { name: "添加语音服务" }),
    ).toBeInTheDocument()

    fireEvent.click(flow.getByRole("button", { name: "返回" }))
    expect(
      flow.getByRole("heading", { name: "添加语音服务" }),
    ).toBeInTheDocument()
    expect(flow.queryByLabelText("服务器地址")).not.toBeInTheDocument()

    fireEvent.click(flow.getByRole("button", { name: "关闭" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
  it("tests both saved details and an edited draft without saving or changing defaults", async () => {
    const profile = {
      id: "fixture",
      name: "Fixture provider",
      kind: "openAiCompatible" as const,
      enabled: false,
      endpoint: "https://old.example/v1",
      model: "old-model",
      options: {
        kind: "openAiCompatible" as const,
        responseFormat: "mp3" as const,
        voices: ["reader"],
        defaultVoice: "reader",
      },
      hasCredential: true,
      revision: 1,
    }
    mocks.getTtsConfig.mockResolvedValue({
      ...config,
      profiles: [profile],
      providers: [
        {
          ...profile,
          voices: profile.options.voices,
          models: [
            { ...profile.options, id: profile.id, model: profile.model },
          ],
        },
      ],
    })
    const user = userEvent.setup()
    render(<TtsProvidersSection />)
    await user.click(
      await screen.findByRole("button", { name: /Fixture provider/ }),
    )
    const dialog = within(screen.getByRole("dialog"))
    expect(
      dialog.getByRole("heading", { name: profile.name }),
    ).toBeInTheDocument()
    expect(dialog.getByText(profile.endpoint)).toBeInTheDocument()
    expect(
      dialog
        .getAllByRole("textbox")
        .every((input) => input.hasAttribute("readonly")),
    ).toBe(true)
    expect(
      dialog.queryByRole("button", { name: "测试" }),
    ).not.toBeInTheDocument()
    expect(dialog.queryByLabelText("默认声音")).not.toBeInTheDocument()
    expect(dialog.queryByLabelText("音频格式")).not.toBeInTheDocument()
    expect(dialog.queryByLabelText("默认朗读指令")).not.toBeInTheDocument()
    await user.click(dialog.getByRole("button", { name: "测试 reader" }))
    expect(mocks.testTtsProvider).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        profile: expect.objectContaining({
          id: "fixture",
          endpoint: profile.endpoint,
          enabled: false,
        }),
        credential: null,
      }),
      "欢迎使用 MyReader 朗读功能。",
    )
    await user.click(dialog.getByRole("button", { name: "编辑语音服务" }))
    fireEvent.change(dialog.getByLabelText("服务器地址"), {
      target: { value: "https://draft.example/v1" },
    })
    fireEvent.change(dialog.getByLabelText("API 密钥或访问令牌"), {
      target: { value: "draft-key" },
    })
    mocks.testTtsProvider.mockRejectedValueOnce(new Error("draft rejected"))
    await user.click(dialog.getByRole("button", { name: "测试 reader" }))
    await dialog.findByText(/draft rejected/)
    expect(mocks.testTtsProvider).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        profile: expect.objectContaining({
          endpoint: "https://draft.example/v1",
        }),
        credential: "draft-key",
      }),
      expect.any(String),
    )
    expect(mocks.saveTtsProvider).not.toHaveBeenCalled()
    expect(mocks.notifyTtsConfigChanged).not.toHaveBeenCalled()
  })

  it("cancels a pending draft test when its form closes", async () => {
    mocks.testTtsProvider.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<TtsProvidersSection />)
    await user.click(
      await screen.findByRole("button", { name: "添加语音服务" }),
    )
    await user.click(
      screen.getByRole("button", { name: "添加 OpenAI 兼容服务" }),
    )
    await user.click(screen.getByRole("button", { name: "添加声音" }))
    fireEvent.change(screen.getByLabelText("声音 ID"), {
      target: { value: "reader" },
    })
    await user.click(screen.getByRole("button", { name: "测试 reader" }))
    expect(
      screen.getByRole("button", { name: "停止试听 reader" }),
    ).toBeEnabled()
    await user.click(screen.getByRole("button", { name: "关闭" }))
    expect(mocks.cancelTtsSynthesis).toHaveBeenCalledWith(
      mocks.testTtsProvider.mock.calls[0][0],
    )
    expect(mocks.saveTtsProvider).not.toHaveBeenCalled()
  })
})

it("saves multiple OpenAI models with shared voices and automatic playback defaults", async () => {
  const user = userEvent.setup()
  render(<TtsProvidersSection />)
  await user.click(await screen.findByRole("button", { name: "添加语音服务" }))
  await user.click(
    await screen.findByRole("button", { name: "添加 OpenAI 兼容服务" }),
  )
  await user.click(screen.getByRole("button", { name: "添加声音" }))
  fireEvent.change(screen.getByLabelText("声音 ID"), {
    target: { value: "reader" },
  })
  await user.click(screen.getByRole("button", { name: "添加声音" }))
  fireEvent.change(screen.getAllByLabelText("声音 ID")[1], {
    target: { value: "actor" },
  })
  await user.click(screen.getByRole("button", { name: "添加模型" }))
  fireEvent.change(screen.getAllByLabelText("模型 ID")[1], {
    target: { value: "tts-second" },
  })
  expect(screen.queryByLabelText("默认朗读指令")).not.toBeInTheDocument()
  expect(
    screen
      .getAllByLabelText("声音 ID")
      .map((input) => (input as HTMLInputElement).value),
  ).toEqual(["reader", "actor"])
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "添加语音服务",
    }),
  )
  await waitFor(() =>
    expect(mocks.saveTtsProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({
          voices: ["reader", "actor"],
          models: [
            expect.objectContaining({
              model: "gpt-4o-mini-tts",
              instructions: null,
              responseFormat: "mp3",
              defaultVoice: "reader",
              voices: [],
            }),
            expect.objectContaining({
              model: "tts-second",
              instructions: null,
              responseFormat: "mp3",
              defaultVoice: "reader",
              voices: [],
            }),
          ],
        }),
      }),
    ),
  )
})

it("keeps OpenAI model-specific voices separate when saving", async () => {
  const user = userEvent.setup()
  render(<TtsProvidersSection />)
  await user.click(await screen.findByRole("button", { name: "添加语音服务" }))
  await user.click(screen.getByRole("button", { name: "添加 OpenAI 兼容服务" }))
  await user.click(screen.getByRole("button", { name: "添加声音" }))
  fireEvent.change(screen.getByLabelText("声音 ID"), {
    target: { value: "reader" },
  })
  await user.click(screen.getByRole("button", { name: "添加模型" }))
  fireEvent.change(screen.getAllByLabelText("模型 ID")[1], {
    target: { value: "second-tts" },
  })
  await user.click(screen.getByRole("switch", { name: "音色按模型配置" }))
  expect(screen.getByLabelText("声音 ID")).toHaveValue("reader")
  fireEvent.change(screen.getByLabelText("声音 ID"), {
    target: { value: "actor" },
  })
  await user.click(
    screen.getByRole("button", { name: "模型设置 gpt-4o-mini-tts" }),
  )
  expect(screen.getByLabelText("声音 ID")).toHaveValue("reader")
  expect(screen.queryByLabelText("默认声音")).not.toBeInTheDocument()
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "添加语音服务",
    }),
  )
  await waitFor(() =>
    expect(mocks.saveTtsProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({
          modelScopedVoices: true,
          voices: [],
          models: [
            expect.objectContaining({
              model: "gpt-4o-mini-tts",
              voices: ["reader"],
              defaultVoice: "reader",
            }),
            expect.objectContaining({
              model: "second-tts",
              voices: ["actor"],
              defaultVoice: "actor",
            }),
          ],
        }),
      }),
    ),
  )
})

it("merges editable system presets with account voices and tests each unsaved voice", async () => {
  mocks.listQwenTtsModels.mockResolvedValue([
    presets[1].defaultModel,
    {
      id: "qwen-new",
      name: "New TTS",
      audioFormats: ["wav"],
      supportsInstructions: false,
      voiceDiscovery: true,
      voices: [
        { id: "builtin", name: "Built in", language: "mul", gender: null },
      ],
    },
  ])
  mocks.discoverQwenTtsVoices.mockResolvedValue([
    { id: "builtin", name: "Built in", language: "mul", gender: null },
    { id: "custom", name: "My voice", language: "mul", gender: null },
  ])
  render(<TtsProvidersSection />)
  fireEvent.click(await screen.findByRole("button", { name: "添加语音服务" }))
  fireEvent.click(
    await screen.findByRole("button", { name: /^Qwen · 按需计费/ }),
  )
  fireEvent.change(screen.getByLabelText("API 密钥或访问令牌"), {
    target: { value: "draft-key" },
  })
  fireEvent.click(screen.getByRole("button", { name: "获取可用模型" }))
  fireEvent.click(await screen.findByRole("checkbox", { name: /New TTS/ }))
  fireEvent.click(screen.getByRole("button", { name: "添加所选模型" }))
  await waitFor(() =>
    expect(
      screen
        .getAllByLabelText("声音 ID")
        .map((el) => (el as HTMLInputElement).value),
    ).toEqual(["builtin", "custom"]),
  )
  expect(mocks.discoverQwenTtsVoices).toHaveBeenCalledWith(
    expect.objectContaining({ model: "qwen-new", credential: "draft-key" }),
  )
  fireEvent.change(
    within(screen.getByRole("region", { name: "声音列表" })).getAllByLabelText(
      "显示名称",
    )[1],
    { target: { value: "Actor" } },
  )
  fireEvent.click(screen.getByRole("button", { name: "测试 Actor" }))
  await waitFor(() =>
    expect(mocks.testTtsProvider).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        profile: expect.objectContaining({
          model: "qwen-new",
          options: expect.objectContaining({
            defaultVoice: "custom",
            responseFormat: "wav",
          }),
        }),
      }),
      expect.any(String),
    ),
  )
  expect(mocks.saveTtsProvider).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "删除声音 Built in" }))
  mocks.discoverQwenTtsVoices.mockResolvedValue([
    { id: "custom", name: "My voice", language: "mul", gender: null },
  ])
  fireEvent.click(screen.getByRole("button", { name: "获取声音" }))
  await waitFor(() =>
    expect(mocks.discoverQwenTtsVoices).toHaveBeenCalledTimes(2),
  )
  expect(screen.getAllByLabelText("声音 ID")).toHaveLength(1)
  expect(screen.getByRole("button", { name: "测试 Actor" })).toBeInTheDocument()
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "添加语音服务",
    }),
  )
  await waitFor(() =>
    expect(mocks.saveTtsProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({
          models: expect.arrayContaining([
            expect.objectContaining({
              model: "qwen-new",
              voiceNames: { custom: "Actor" },
              voices: ["custom"],
            }),
          ]),
        }),
      }),
    ),
  )
})

it("previews a shared voice with the chosen model and preserves saved playback values when editing names", async () => {
  const models = [
    {
      id: "first",
      model: "first-model",
      displayName: "First model",
      voices: [],
      voiceNames: {},
      responseFormat: "wav",
      defaultVoice: "reader",
      instructions: "Warm",
    },
    {
      id: "second",
      model: "second-model",
      displayName: "Second model",
      voices: [],
      voiceNames: {},
      responseFormat: "mp3",
      defaultVoice: "actor",
      instructions: null,
    },
  ]
  mocks.getTtsConfig.mockResolvedValue({
    ...config,
    providers: [
      {
        id: "existing-provider",
        name: "Voice service",
        kind: "openAiCompatible",
        enabled: true,
        endpoint: "https://example.com/v1",
        hasCredential: true,
        modelScopedVoices: false,
        voices: ["reader", "actor"],
        voiceNames: {},
        models,
      },
    ],
  })
  const user = userEvent.setup()
  render(<TtsProvidersSection />)
  await user.click(await screen.findByRole("button", { name: "编辑语音服务" }))
  expect(screen.queryByLabelText("默认声音")).not.toBeInTheDocument()
  expect(screen.queryByLabelText("音频格式")).not.toBeInTheDocument()
  expect(screen.queryByLabelText("默认朗读指令")).not.toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole("combobox", { name: "测试模型" }), {
    key: "ArrowDown",
  })
  await user.click(await screen.findByRole("option", { name: "Second model" }))
  await user.click(screen.getByRole("button", { name: "测试 reader" }))
  expect(mocks.testTtsProvider).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({
      profile: expect.objectContaining({
        model: "second-model",
        options: expect.objectContaining({
          defaultVoice: "reader",
          responseFormat: "mp3",
        }),
      }),
    }),
    expect.any(String),
  )
  fireEvent.change(screen.getByLabelText("名称"), {
    target: { value: "Renamed service" },
  })
  await user.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() =>
    expect(mocks.saveTtsProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({ name: "Renamed service", models }),
        credential: null,
        clearCredential: false,
      }),
    ),
  )
})
