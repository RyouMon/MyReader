import "@/i18n"
import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"

import { TTS_AUDIO_FORMATS } from "@/constants/tts"
import type { QwenTtsPresetDto, TtsConfigDto } from "@/lib/tauri-specta"
import SpeechSection from "../SpeechSection"

const mocks = vi.hoisted(() => ({
  getTtsConfig: vi.fn(),
  listQwenTtsModels: vi.fn(),
  listQwenTtsPresets: vi.fn(),
  discoverQwenTtsVoices: vi.fn(),
  upsertTtsProfile: vi.fn(),
  notifyTtsConfigChanged: vi.fn(),
}))

vi.mock("@/lib/tauri-api", () => ({
  api: {
    getTtsConfig: mocks.getTtsConfig,
    listQwenTtsModels: mocks.listQwenTtsModels,
    listQwenTtsPresets: mocks.listQwenTtsPresets,
    discoverQwenTtsVoices: mocks.discoverQwenTtsVoices,
    upsertTtsProfile: mocks.upsertTtsProfile,
  },
  formatApiError: (error: unknown) => String(error),
}))

vi.mock("@/lib/tts/events", () => ({
  notifyTtsConfigChanged: mocks.notifyTtsConfigChanged,
}))

const config: TtsConfigDto = {
  schemaVersion: 1,
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

const presets: QwenTtsPresetDto[] = [
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
    voices: [
      {
        id: id === "tokenPlan" ? "longanhuan_v3.6" : "longanlingxin",
        name: id === "tokenPlan" ? "龙安欢" : "龙安灵心",
        language: "mul",
        gender: null,
      },
    ],
  },
}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("ResizeObserver", ResizeObserverMock)
  HTMLElement.prototype.scrollIntoView = vi.fn()
  mocks.getTtsConfig.mockResolvedValue(config)
  mocks.listQwenTtsPresets.mockResolvedValue(presets)
  mocks.listQwenTtsModels.mockImplementation(async (endpoint) =>
    presets
      .filter((preset) => preset.endpoint === endpoint)
      .map((preset) => preset.defaultModel),
  )
  mocks.discoverQwenTtsVoices.mockResolvedValue([])
  mocks.upsertTtsProfile.mockResolvedValue(config)
})

describe("SpeechSection", () => {
  it.each([
    [0, "Qwen · Token Plan", "Token Plan 套餐密钥（sk-sp- 开头）"],
    [1, "Qwen · 按需计费", "千问 AI 平台 API Key（非套餐密钥）"],
    [2, "Qwen · DashScope（百炼）", "阿里云百炼 API Key（与服务地域一致）"],
  ] as const)("creates and reopens Qwen source %s without changing its endpoint", async (index, title, placeholder) => {
    const user = userEvent.setup()
    const preset = presets[index]
    mocks.upsertTtsProfile.mockImplementation(async ({ profile }) => ({
      ...config,
      profiles: [
        { ...profile, id: "saved-qwen", revision: 1, hasCredential: true },
      ],
    }))
    render(<SpeechSection />)
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
    await user.click(form.getByRole("button", { name: "添加语音服务" }))
    await waitFor(() =>
      expect(mocks.upsertTtsProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({
            kind: "qwen",
            name: title,
            endpoint: preset.endpoint,
            model: preset.defaultModel.id,
            options: expect.objectContaining({
              defaultVoice: preset.defaultModel.voices[0].id,
            }),
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
    render(<SpeechSection />)
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
    await user.type(
      screen.getByLabelText("补充音色 ID（可选）"),
      "subscription-voice",
    )
    await user.click(screen.getByRole("button", { name: "返回" }))
    await user.click(screen.getByRole("button", { name: /^Qwen · 按需计费/ }))
    expect(screen.getByLabelText("API 密钥或访问令牌")).toHaveValue("")
    expect(screen.getByLabelText("补充音色 ID（可选）")).toHaveValue("")
    expect(screen.getByLabelText("服务器地址")).toHaveValue(presets[1].endpoint)
  })

  it("adds Qwen with model-specific defaults and accepts new manually supplied voice IDs", async () => {
    render(<SpeechSection />)
    await screen.findByRole("heading", { name: "默认朗读引擎" })
    fireEvent.click(screen.getByRole("button", { name: "添加语音服务" }))
    const choice = await screen.findByRole("button", {
      name: /^Qwen · Token Plan/,
    })
    await waitFor(() => expect(choice).toBeEnabled())
    fireEvent.click(choice)
    const form = within(screen.getByRole("dialog"))
    expect(form.getByRole("combobox", { name: "模型" })).toHaveTextContent(
      "Qwen-Audio-TTS Plus",
    )
    expect(form.getByRole("combobox", { name: "音频格式" })).toHaveTextContent(
      "MP3",
    )
    expect(form.getByRole("combobox", { name: "默认声音" })).toHaveTextContent(
      "龙安欢",
    )
    expect(form.getByLabelText("朗读指令")).toBeInTheDocument()
    expect(form.getByLabelText("服务器地址")).toHaveValue(
      "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference",
    )
    fireEvent.change(form.getByLabelText("API 密钥或访问令牌"), {
      target: { value: "sk-sp-fixture" },
    })
    expect(mocks.discoverQwenTtsVoices).not.toHaveBeenCalled()
    fireEvent.change(form.getByLabelText("补充音色 ID（可选）"), {
      target: { value: "future-voice" },
    })
    fireEvent.keyDown(form.getByRole("combobox", { name: "默认声音" }), {
      key: "ArrowDown",
    })
    fireEvent.click(await screen.findByRole("option", { name: "future-voice" }))
    fireEvent.click(form.getByRole("button", { name: "添加语音服务" }))
    await waitFor(() =>
      expect(mocks.upsertTtsProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({
            kind: "qwen",
            endpoint:
              "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference",
            model: "qwen-audio-3.0-tts-plus",
            options: expect.objectContaining({
              kind: "qwen",
              responseFormat: "mp3",
              defaultVoice: "future-voice",
              voices: ["future-voice"],
            }),
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

    await screen.findByRole("heading", { name: "试听" })
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
      screen.getByRole("heading", { name: "阅读引擎与语音服务" }),
    ).toBeInTheDocument()
    expect(screen.getAllByText("My voice service")).toHaveLength(2)
    expect(
      screen.queryByRole("button", { name: "测试并试听" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/隐私提示：系统朗读在本机处理/),
    ).not.toBeInTheDocument()
  })

  it("should add a provider through the standard dialog flow", async () => {
    render(<SpeechSection />)

    await screen.findByRole("heading", { name: "默认朗读引擎" })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "添加语音服务" }))

    const dialog = screen.getByRole("dialog")
    const flow = within(dialog)
    expect(dialog).toHaveClass("h-[min(86vh,720px)]")
    expect(dialog).toHaveClass("grid-rows-[auto_minmax(0,1fr)]")
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
    const audioFormat = flow.getByRole("combobox", { name: "音频格式" })
    expect(audioFormat).toHaveAttribute("data-slot", "select-trigger")
    expect(audioFormat).toHaveTextContent("MP3")
    expect(TTS_AUDIO_FORMATS).toEqual(["mp3", "opus", "aac", "flac", "wav"])
    expect(
      dialog.querySelector('[data-slot="tts-provider-form-content"]'),
    ).toHaveClass("min-h-0", "flex-1", "overflow-y-auto")
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
})
