import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
import { BookNarrationSettings } from "../BookNarrationSettings"
import type { BookNarrationSettingsDto, TtsConfigDto } from "@/lib/tauri-specta"

const mocks = vi.hoisted(() => ({
  getBookNarration: vi.fn(),
  saveBookNarration: vi.fn(),
  importBookCharacters: vi.fn(),
  getLlmConfig: vi.fn(),
  listTtsVoices: vi.fn(),
}))
vi.mock("@/lib/tauri-api", () => ({ api: mocks, formatApiError: String }))
vi.mock("@/lib/tts/events", () => ({
  notifyTtsConfigChanged: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}))

const book = {
  libraryId: "library",
  bookId: 42,
  title: "Book",
  authors: ["Writer"],
  language: "zh",
}
const settings: BookNarrationSettingsDto = {
  bookId: 42,
  enabled: false,
  revision: 0,
  identityRevision: 0,
  characters: [
    {
      id: "narrator",
      name: "Narrator",
      aliases: [],
      identity: "",
      voice: null,
      instructions: "",
      source: null,
    },
    {
      id: "stable-id",
      name: "陈默",
      aliases: ["老陈"],
      identity: "Manual identity",
      voice: { engine: "provider", profileId: "one", voiceId: "A" },
      instructions: "温柔",
      source: null,
    },
  ],
}
const config: TtsConfigDto = {
  schemaVersion: 1,
  defaultEngine: { kind: "system" },
  voiceByLanguage: {},
  playback: {
    speed: 1,
    pitch: 1,
    skipPageBreaks: false,
    skipFootnotes: false,
    announceContext: false,
  },
  profiles: ["one", "two"].map((id) => ({
    id,
    name: id,
    kind: "openAiCompatible",
    enabled: true,
    endpoint: "https://example.com/v1",
    model: "tts",
    hasCredential: false,
    revision: 1,
    options: {
      kind: "openAiCompatible",
      responseFormat: "mp3",
      voices: ["A"],
      defaultVoice: "A",
    },
  })),
}

function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <BookNarrationSettings book={book} config={config} />
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  HTMLElement.prototype.hasPointerCapture = () => false
  HTMLElement.prototype.setPointerCapture = () => undefined
  HTMLElement.prototype.releasePointerCapture = () => undefined
  HTMLElement.prototype.scrollIntoView = () => undefined

  vi.clearAllMocks()
  mocks.getBookNarration.mockResolvedValue(settings)
  mocks.saveBookNarration.mockImplementation(async (_library, value) => ({
    ...value,
    revision: value.revision + 1,
  }))
  mocks.getLlmConfig.mockResolvedValue({
    defaultProfileId: "llm",
    profiles: [],
  })
  mocks.listTtsVoices.mockResolvedValue([
    { id: "A", name: "Voice A", language: "zh", gender: null },
  ])
})

it("reveals this book's forms only after enable confirmation and keeps LLM editing out of the reader", async () => {
  mount()
  const toggle = await screen.findByRole("switch", {
    name: "narration.enabled",
  })
  expect(
    screen.queryByRole("button", { name: "narration.add" }),
  ).not.toBeInTheDocument()
  fireEvent.click(toggle)
  fireEvent.click(
    await screen.findByRole("button", { name: "narration.enableConfirm" }),
  )
  expect(
    await screen.findByRole("button", { name: "narration.add" }),
  ).toBeInTheDocument()
  expect(screen.queryByLabelText("llm.endpoint")).not.toBeInTheDocument()
  fireEvent.click(toggle)
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "narration.add" }),
    ).not.toBeInTheDocument(),
  )
  expect(mocks.saveBookNarration).toHaveBeenLastCalledWith(
    "library",
    expect.objectContaining({ bookId: 42, enabled: false }),
  )
})

it("clears the previous voice when switching provider and preserves the stable character ID", async () => {
  mocks.getBookNarration.mockResolvedValue({ ...settings, enabled: true })
  mount()
  fireEvent.click(await screen.findByRole("button", { name: /^陈默/ }))
  const user = userEvent.setup()
  await user.click(screen.getByRole("combobox", { name: "narration.provider" }))
  await user.click(screen.getByRole("option", { name: "two" }))
  expect(screen.getByRole("button", { name: "llm.save" })).toBeDisabled()
  await user.click(screen.getByRole("combobox", { name: "narration.voice" }))
  await user.click(await screen.findByRole("option", { name: "Voice A" }))
  fireEvent.change(screen.getByLabelText("narration.instructions"), {
    target: { value: "仿男声" },
  })
  fireEvent.click(screen.getByRole("button", { name: "llm.save" }))
  await waitFor(() =>
    expect(mocks.saveBookNarration).toHaveBeenCalledWith(
      "library",
      expect.objectContaining({
        characters: expect.arrayContaining([
          expect.objectContaining({
            id: "stable-id",
            voice: { engine: "provider", profileId: "two", voiceId: "A" },
            instructions: "仿男声",
          }),
        ]),
      }),
    ),
  )
})

it("imports selected sourced characters without overwriting an existing manual identity", async () => {
  mocks.getBookNarration.mockResolvedValue({ ...settings, enabled: true })
  const source = {
    title: "Book",
    url: "https://zh.wikipedia.org/w/index.php?curid=1",
  }
  mocks.importBookCharacters.mockResolvedValue([
    { name: "陈默", aliases: [], identity: "Imported identity", source },
    { name: "林岚", aliases: [], identity: "Student", source },
  ])
  mount()
  fireEvent.click(
    await screen.findByRole("button", { name: "narration.import" }),
  )
  fireEvent.click(
    await screen.findByRole("button", { name: "narration.importSelected" }),
  )
  await waitFor(() => expect(mocks.saveBookNarration).toHaveBeenCalled())
  const saved = mocks.saveBookNarration.mock
    .calls[0]![1] as BookNarrationSettingsDto
  expect(saved.characters).toHaveLength(3)
  expect(
    saved.characters.find((character) => character.id === "stable-id")
      ?.identity,
  ).toBe("Manual identity")
  expect(saved.characters[saved.characters.length - 1]).toEqual(
    expect.objectContaining({ name: "林岚", source, id: "" }),
  )
  expect(mocks.importBookCharacters).toHaveBeenCalledWith(
    "library",
    expect.objectContaining({ title: "Book", authors: ["Writer"] }),
  )
})
