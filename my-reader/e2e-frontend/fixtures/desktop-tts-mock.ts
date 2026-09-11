import { fileURLToPath } from "node:url"
import type { Page } from "@playwright/test"
import { setupReaderMocks } from "./reader-mock"

const fixtureDirectory = fileURLToPath(
  new URL("../../../my-reader-mobile/e2e/fixtures/tts-book", import.meta.url),
)
const fixtureUrl = `/@fs${fixtureDirectory.replaceAll("\\", "/")}`

export async function setupDesktopTtsMocks(page: Page) {
  await page.addInitScript(() => {
    type FakeUtterance = {
      text: string
      lang: string
      rate: number
      pitch: number
      volume: number
      voice: unknown
      onstart: ((event: unknown) => void) | null
      onend: ((event: unknown) => void) | null
      onerror: ((event: { error: string }) => void) | null
      onpause: ((event: unknown) => void) | null
      onresume: ((event: unknown) => void) | null
    }

    class FakeSpeechSynthesisUtterance {
      text: string
      lang = ""
      rate = 1
      pitch = 1
      volume = 1
      voice: unknown = null

      constructor(text = "") {
        this.text = text
      }
    }

    for (const event of [
      "start",
      "end",
      "error",
      "mark",
      "pause",
      "resume",
      "boundary",
    ]) {
      Object.defineProperty(
        FakeSpeechSynthesisUtterance.prototype,
        `on${event}`,
        {
          configurable: true,
          writable: true,
          value: null,
        },
      )
    }

    const voices = [
      {
        default: true,
        lang: "en-US",
        localService: true,
        name: "MyReader E2E Voice",
        voiceURI: "myreader-e2e-voice",
      },
    ]
    let current: FakeUtterance | null = null
    let speaking = false
    let paused = false
    const spoken: string[] = []

    const speechSynthesis = {
      get speaking() {
        return speaking
      },
      get paused() {
        return paused
      },
      onvoiceschanged: null,
      getVoices: () => voices,
      speak: (utterance: FakeUtterance) => {
        current = utterance
        speaking = true
        paused = false
        spoken.push(utterance.text)
        queueMicrotask(() => {
          if (current === utterance && speaking && !paused) {
            utterance.onstart?.({ type: "start" })
          }
        })
      },
      cancel: () => {
        current = null
        speaking = false
        paused = false
      },
      pause: () => {
        if (!current || paused) return
        paused = true
        current.onpause?.({ type: "pause" })
      },
      resume: () => {
        if (!current || !paused) return
        paused = false
        current.onresume?.({ type: "resume" })
      },
    }

    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: FakeSpeechSynthesisUtterance,
    })
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: speechSynthesis,
    })

    ;(window as unknown as Record<string, unknown>).__MYREADER_TTS_E2E__ = {
      spoken,
      currentText: () => current?.text ?? null,
      finishCurrent: () => {
        const utterance = current
        if (!utterance) return false
        current = null
        speaking = false
        paused = false
        utterance.onend?.({ type: "end" })
        return true
      },
      failCurrent: (error = "synthesis-unavailable") => {
        const utterance = current
        if (!utterance) return false
        current = null
        speaking = false
        paused = false
        utterance.onerror?.({ error })
        return true
      },
      state: () => ({ paused, speaking }),
    }

    const existingHandlers =
      (
        window as unknown as Record<
          string,
          Record<string, (args: Record<string, unknown>) => unknown>
        >
      ).__TAURI_IPC_HANDLERS__ ?? {}
    const ttsConfig = {
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

    ;(window as unknown as Record<string, unknown>).__TAURI_IPC_HANDLERS__ = {
      ...existingHandlers,
      get_reader_ui_preferences: () => ({
        version: 7,
        appLanguage: "zh-CN",
        libraryViewMode: "grid",
        fixedLayout: {},
        reflowable: {
          settings: {
            theme: "default",
            fontFamily: "default",
            fontFamiliesByLanguage: {},
            fontSize: 18,
            lineHeight: 1.6,
            paddingX: 16,
            readingLayout: "paginated",
            textAlign: "justify",
            colCount: "auto",
          },
          tts: { ttsConfigId: "default", ttsSpeed: 1 },
        },
      }),
      get_reading_progress: () => null,
      list_reading_position_candidates: () => [],
      set_reading_progress: () => null,
      add_reading_session_interval: () => null,
      list_reader_annotations: () => [],
      list_reader_bookmarks: () => [],
      get_tts_config: () => ttsConfig,
      set_tts_playback_preferences: () => ttsConfig,
      set_tts_voice_for_language: () => ttsConfig,
      set_reader_traffic_lights_visible: () => null,
    }
  })

  await setupReaderMocks(page, {
    bookId: 1,
    format: "EPUB",
    extractedDirPath: fixtureUrl,
  })
}
