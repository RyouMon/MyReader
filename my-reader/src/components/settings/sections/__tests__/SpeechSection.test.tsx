import "@/i18n"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TTS_AUDIO_FORMATS } from "@/constants/tts"
import type { TtsConfigDto } from "@/lib/tauri-specta"
import SpeechSection from "../SpeechSection"

const mocks = vi.hoisted(() => ({
  getTtsConfig: vi.fn(),
  notifyTtsConfigChanged: vi.fn(),
}))

vi.mock("@/lib/tauri-api", () => ({
  api: {
    getTtsConfig: mocks.getTtsConfig,
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

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("ResizeObserver", ResizeObserverMock)
  mocks.getTtsConfig.mockResolvedValue(config)
})

describe("SpeechSection", () => {
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
