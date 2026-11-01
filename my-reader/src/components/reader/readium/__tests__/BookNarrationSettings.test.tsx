import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  BookNarrationSettings,
  type NarrationSubview,
} from "../BookNarrationSettings"
import { useState, type ComponentProps } from "react"
import { Settings2 } from "lucide-react"
import { ReaderSidePanelHeader } from "@/components/reader/shared/ReaderSidePanelChrome"
import type { BookNarrationSettingsDto, TtsConfigDto } from "@/lib/tauri-specta"

const mocks = vi.hoisted(() => ({
  getBookNarration: vi.fn(),
  saveBookNarration: vi.fn(),
  searchBookCharacterSources: vi.fn(),
  draftBookCharacters: vi.fn(),
  previewBookNarrationMerge: vi.fn(),
  mergeBookNarration: vi.fn(),
  getLlmConfig: vi.fn(),
  listTtsVoices: vi.fn(),
  synthesizeTtsRequest: vi.fn(),
  cancelTtsSynthesis: vi.fn(),
}))
vi.mock("@/lib/tauri-api", () => ({ api: mocks, formatApiError: String }))
vi.mock("@/lib/tts/events", () => ({
  TTS_CONFIG_CHANGED_EVENT: "myreader://tts-config-changed",
  notifyTtsConfigChanged: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
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
  scopeId: "book:fixture",
  scopeName: null,
  mergeSources: [],
  identityRevision: 0,
  characters: [
    {
      id: "narrator",
      name: "Narrator",
      nicknames: [],
      description: "",
      voice: null,
      instructions: "",
      source: null,
    },
    {
      id: "stable-id",
      name: "陈默",
      nicknames: ["老陈"],
      description: "Manual identity",
      voice: { engine: "provider", profileId: "one", voiceId: "A" },
      instructions: "温柔",
      source: null,
    },
  ],
}
const config: TtsConfigDto = {
  schemaVersion: 2,
  providers: [],
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

function SettingsFixture(props: ComponentProps<typeof BookNarrationSettings>) {
  const [view, setView] = useState<NarrationSubview | null>(null)
  return (
    <>
      <ReaderSidePanelHeader
        title={view?.title ?? "Listening settings"}
        icon={Settings2}
        onBack={view?.onBack}
        backLabel="common.back"
      />
      <BookNarrationSettings {...props} onSubviewChange={setView} />
    </>
  )
}

async function openCharacters() {
  fireEvent.click(await screen.findByRole("button", { name: "narration.edit" }))
}

function mount(
  findIntroductions?: () => Promise<
    import("@/lib/readium/characterIntroductions").CharacterIntroduction[]
  >,
) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <SettingsFixture
        book={book}
        config={config}
        readingVoice={{ engine: "provider", profileId: "two", voiceId: "A" }}
        findIntroductions={findIntroductions}
      />
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
    characters: value.characters.map(
      (
        character: BookNarrationSettingsDto["characters"][number],
        index: number,
      ) => ({
        ...character,
        id: character.id || `new-character-${index}`,
      }),
    ),
  }))
  mocks.getLlmConfig.mockResolvedValue({
    defaultProfileId: "llm",
    profiles: [],
  })
  mocks.listTtsVoices.mockResolvedValue([
    { id: "A", language: "zh", gender: null },
  ])
  mocks.synthesizeTtsRequest.mockReturnValue(new Promise(() => {}))
  mocks.cancelTtsSynthesis.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllGlobals())

it("reveals this book's forms only after enable confirmation and keeps LLM editing out of the reader", async () => {
  mount()
  const toggle = await screen.findByRole("switch", {
    name: "narration.enabled",
  })
  expect(
    screen.queryByRole("button", { name: "narration.edit" }),
  ).not.toBeInTheDocument()
  fireEvent.click(toggle)
  fireEvent.click(
    await screen.findByRole("button", { name: "narration.enableConfirm" }),
  )
  expect(
    await screen.findByRole("button", { name: "narration.edit" }),
  ).toBeInTheDocument()
  expect(screen.queryByLabelText("llm.endpoint")).not.toBeInTheDocument()
  fireEvent.click(toggle)
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "narration.edit" }),
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
  await openCharacters()
  fireEvent.click(await screen.findByRole("button", { name: /^陈默/ }))
  const user = userEvent.setup()
  await user.click(screen.getByRole("combobox", { name: "narration.provider" }))
  expect(
    screen.getByRole("option", { name: "narration.defaultModel" }),
  ).toBeInTheDocument()
  await user.click(screen.getByRole("option", { name: "two/tts" }))
  expect(screen.getByRole("button", { name: "common.save" })).toBeDisabled()
  await user.click(screen.getByRole("combobox", { name: "narration.voice" }))
  expect(
    screen.queryByRole("option", { name: "narration.defaultModel" }),
  ).not.toBeInTheDocument()
  await user.click(await screen.findByRole("option", { name: "A" }))
  fireEvent.change(screen.getByLabelText("narration.instructions"), {
    target: { value: "仿男声" },
  })
  fireEvent.click(screen.getByRole("button", { name: "common.save" }))
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

it("requires a concrete system voice and never offers a default voice option", async () => {
  vi.stubGlobal("speechSynthesis", {
    getVoices: () => [{ voiceURI: "system-voice", name: "System Voice" }],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  mocks.getBookNarration.mockResolvedValue({ ...settings, enabled: true })
  mount()
  await openCharacters()
  fireEvent.click(await screen.findByRole("button", { name: /^陈默/ }))
  const user = userEvent.setup()
  await user.click(screen.getByRole("combobox", { name: "narration.provider" }))
  await user.click(screen.getByRole("option", { name: "narration.system" }))
  expect(screen.getByRole("button", { name: "common.save" })).toBeDisabled()
  expect(
    screen.getByRole("button", { name: "settings.speech.previewAction" }),
  ).toBeDisabled()
  await user.click(screen.getByRole("combobox", { name: "narration.voice" }))
  expect(
    screen.queryByRole("option", { name: "narration.defaultModel" }),
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole("option", { name: "System Voice" }))
  fireEvent.click(screen.getByRole("button", { name: "common.save" }))
  await waitFor(() =>
    expect(mocks.saveBookNarration).toHaveBeenCalledWith(
      "library",
      expect.objectContaining({
        characters: expect.arrayContaining([
          expect.objectContaining({
            id: "stable-id",
            voice: { engine: "system", voiceId: "system-voice" },
          }),
        ]),
      }),
    ),
  )
})

it("previews the unsaved character voice and instructions, then cancels without saving", async () => {
  mocks.getBookNarration.mockResolvedValue({ ...settings, enabled: true })
  mount()
  await openCharacters()
  fireEvent.click(await screen.findByRole("button", { name: /^陈默/ }))
  fireEvent.change(screen.getByLabelText("narration.instructions"), {
    target: { value: "轻声、温柔" },
  })
  fireEvent.click(
    screen.getByRole("button", { name: "settings.speech.previewAction" }),
  )
  expect(mocks.synthesizeTtsRequest).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      profileId: "one",
      voiceId: "A",
      instructions: "轻声、温柔",
    }),
  )
  expect(
    screen.getByRole("button", { name: "settings.speech.stopPreview" }),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "llm.cancel" }))
  expect(mocks.cancelTtsSynthesis).toHaveBeenCalledWith(
    mocks.synthesizeTtsRequest.mock.calls[0][0],
  )
  expect(mocks.saveBookNarration).not.toHaveBeenCalled()
  expect(
    await screen.findByRole("button", { name: /^陈默/ }),
  ).toBeInTheDocument()
})

it("saves the default model as inheritance and previews the current external settings", async () => {
  mocks.getBookNarration.mockResolvedValue({ ...settings, enabled: true })
  mount()
  await openCharacters()
  fireEvent.click(await screen.findByRole("button", { name: /^陈默/ }))
  const user = userEvent.setup()
  await user.click(screen.getByRole("combobox", { name: "narration.provider" }))
  await user.click(
    screen.getByRole("option", { name: "narration.defaultModel" }),
  )
  expect(
    screen.queryByRole("combobox", { name: "narration.voice" }),
  ).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole("button", { name: "settings.speech.previewAction" }),
  )
  expect(mocks.synthesizeTtsRequest).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      profileId: "two",
      voiceId: "A",
      instructions: "温柔",
    }),
  )
  fireEvent.click(screen.getByRole("button", { name: "common.save" }))
  await waitFor(() =>
    expect(mocks.saveBookNarration).toHaveBeenCalledWith(
      "library",
      expect.objectContaining({
        characters: expect.arrayContaining([
          expect.objectContaining({ id: "stable-id", voice: null }),
        ]),
      }),
    ),
  )
})

it.each([
  true,
  false,
])("previews external settings with a separately configured narrator: %s", async (configuredNarrator) => {
  mocks.getBookNarration.mockResolvedValue({
    ...settings,
    enabled: true,
    characters: settings.characters.map((character) => ({
      ...character,
      voice:
        character.id === "narrator" && configuredNarrator
          ? { engine: "provider", profileId: "one", voiceId: "A" }
          : null,
    })),
  })
  mount()
  await openCharacters()
  fireEvent.click(await screen.findByRole("button", { name: /^陈默/ }))
  expect(
    screen.getByRole("combobox", { name: "narration.provider" }),
  ).toHaveTextContent("narration.defaultModel")
  expect(
    screen.queryByRole("combobox", { name: "narration.voice" }),
  ).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole("button", { name: "settings.speech.previewAction" }),
  )
  expect(mocks.synthesizeTtsRequest).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      profileId: "two",
      voiceId: "A",
    }),
  )
  fireEvent.click(screen.getByRole("button", { name: "common.back" }))
  expect(mocks.cancelTtsSynthesis).toHaveBeenCalledWith(
    mocks.synthesizeTtsRequest.mock.calls[0][0],
  )
})

it.each([
  ["陈默", false],
  ["陈默", true],
  ["陳默", false],
  ["陳默", true],
] as const)("imports duplicate %s only with explicit replacement selected: %s", async (name, replace) => {
  mocks.getBookNarration.mockResolvedValue({ ...settings, enabled: true })
  const source = {
    title: "Book",
    url: "https://zh.wikipedia.org/w/index.php?curid=1",
  }
  mocks.searchBookCharacterSources.mockResolvedValue([source])
  mocks.draftBookCharacters.mockResolvedValue([
    {
      id: "stable-id",
      voice: null,
      instructions: "",
      name,
      nicknames: ["新昵称"],
      description: "Imported identity",
      source,
    },
    {
      id: "",
      voice: null,
      instructions: "",
      name: "林岚",
      nicknames: [],
      description: "Student",
      source,
    },
    {
      id: "",
      voice: null,
      instructions: "",
      name: "老陈",
      nicknames: ["陈默"],
      description: "A different character",
      source,
    },
  ])
  mount()
  const user = userEvent.setup()
  await openCharacters()
  await user.click(await screen.findByRole("button", { name: "narration.add" }))
  await user.click(
    await screen.findByRole("menuitem", { name: "narration.import" }),
  )
  await user.click(screen.getByRole("button", { name: "narration.search" }))
  await user.click(await screen.findByRole("button", { name: "Book" }))
  await user.click(screen.getByRole("button", { name: "narration.organize" }))
  const duplicate = await screen.findByRole("checkbox", {
    name: "narration.replaceCharacter",
  })
  expect(duplicate).not.toBeChecked()
  expect(screen.getByText("narration.alreadyExists")).toBeVisible()
  if (replace) {
    await user.click(duplicate)
    expect(screen.getByText("narration.willReplace")).toBeVisible()
  }
  fireEvent.click(
    await screen.findByRole("button", { name: "narration.importSelected" }),
  )
  await waitFor(() => expect(mocks.saveBookNarration).toHaveBeenCalled())
  const saved = mocks.saveBookNarration.mock
    .calls[0]![1] as BookNarrationSettingsDto
  expect(saved.characters).toHaveLength(4)
  expect(
    saved.characters.find((character) => character.id === "stable-id")
      ?.description,
  ).toBe(replace ? "Imported identity" : "Manual identity")
  const existing = saved.characters.find(
    (character) => character.id === "stable-id",
  )!
  expect(existing.name).toBe(replace ? name : "陈默")
  expect(existing.voice).toEqual(settings.characters[1]!.voice)
  expect(existing.instructions).toBe(settings.characters[1]!.instructions)
  expect(existing.nicknames).toEqual(replace ? ["新昵称"] : ["老陈"])
  expect(existing.source).toEqual(replace ? source : null)
  expect(saved.characters.slice(2)).toEqual([
    expect.objectContaining({ name: "林岚", source, id: "" }),
    expect.objectContaining({ name: "老陈", source, id: "" }),
  ])
  expect(mocks.draftBookCharacters).toHaveBeenCalledWith(
    "library",
    expect.objectContaining({
      book: expect.objectContaining({ title: "Book", authors: ["Writer"] }),
      input: { kind: "encyclopedia", source },
    }),
    expect.any(Function),
    expect.any(AbortSignal),
  )
})

it("reviews a pending series merge before applying identities and voice preferences", async () => {
  const source = {
    scopeId: "book:other",
    title: "Volume 2",
    characters: [
      { ...settings.characters[1]!, id: "other-id", instructions: "沉稳" },
    ],
  }
  const current = {
    ...settings,
    enabled: true,
    scopeId: "series:one",
    scopeName: "Series",
    mergeSources: [source],
  }
  const plan = {
    scopeId: current.scopeId,
    sourceScopeId: source.scopeId,
    revision: current.revision,
    choices: [
      {
        characterId: "other-id",
        targetCharacterId: "stable-id",
        preferIncoming: false,
      },
    ],
  }
  mocks.getBookNarration.mockResolvedValue(current)
  mocks.previewBookNarrationMerge.mockResolvedValue(plan)
  mocks.mergeBookNarration.mockResolvedValue({
    ...current,
    mergeSources: [],
    revision: 1,
  })
  mount()
  await openCharacters()
  fireEvent.click(
    await screen.findByRole("button", { name: "narration.manualMerge" }),
  )
  await screen.findByText("Volume 2")
  expect(mocks.previewBookNarrationMerge).toHaveBeenCalledWith(
    "library",
    42,
    false,
  )
  expect(mocks.mergeBookNarration).not.toHaveBeenCalled()
  const user = userEvent.setup()
  await user.click(
    screen.getByRole("combobox", { name: "narration.voiceAndInstructions" }),
  )
  await user.click(
    screen.getByRole("option", { name: "narration.useIncoming" }),
  )
  fireEvent.click(
    screen.getByRole("button", { name: "narration.confirmMerge" }),
  )
  await waitFor(() =>
    expect(mocks.mergeBookNarration).toHaveBeenCalledWith("library", 42, {
      ...plan,
      choices: [{ ...plan.choices[0], preferIncoming: true }],
    }),
  )
  await screen.findByRole("button", { name: "narration.add" })
})

it("returns from an unfinished edit to the list without saving", async () => {
  mocks.getBookNarration.mockResolvedValue({ ...settings, enabled: true })
  mount()
  await openCharacters()
  fireEvent.click(await screen.findByRole("button", { name: /^陈默/ }))
  expect(
    screen.queryByRole("button", { name: "narration.add" }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole("button", { name: /narration.narrator/ }),
  ).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText("narration.instructions"), {
    target: { value: "unfinished" },
  })
  fireEvent.click(screen.getByRole("button", { name: "common.back" }))
  expect(
    screen.queryByLabelText("narration.instructions"),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole("button", { name: "narration.add" }),
  ).toBeInTheDocument()
  expect(mocks.saveBookNarration).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: /^陈默/ }))
  expect(screen.getByLabelText("narration.instructions")).toHaveValue("温柔")
})

it("reports a missing book introduction without asking AI to invent characters", async () => {
  mocks.getBookNarration.mockResolvedValue({ ...settings, enabled: true })
  const find = vi.fn().mockResolvedValue([])
  mount(find)
  const user = userEvent.setup()
  await openCharacters()
  await user.click(await screen.findByRole("button", { name: "narration.add" }))
  await user.click(screen.getByRole("menuitem", { name: "narration.fromBook" }))
  expect(
    await screen.findByText("narration.noBookIntroduction"),
  ).toBeInTheDocument()
  expect(find).toHaveBeenCalledOnce()
  expect(mocks.draftBookCharacters).not.toHaveBeenCalled()
  expect(mocks.saveBookNarration).not.toHaveBeenCalled()
})

it("only sends selected book passages and waits for candidate confirmation", async () => {
  mocks.getBookNarration.mockResolvedValue({ ...settings, enabled: true })
  mocks.draftBookCharacters.mockResolvedValue([
    { ...settings.characters[1], id: "", name: "林岚" },
  ])
  mount(
    vi.fn().mockResolvedValue([
      {
        id: "cast",
        title: "人物介绍",
        text: "林岚：旅人。",
        locator: { href: "cast.xhtml", locations: {} },
      },
      {
        id: "other",
        title: "角色介绍",
        text: "未选择的内容。",
        locator: { href: "other.xhtml", locations: {} },
      },
    ]),
  )
  const user = userEvent.setup()
  await openCharacters()
  await user.click(await screen.findByRole("button", { name: "narration.add" }))
  await user.click(screen.getByRole("menuitem", { name: "narration.fromBook" }))
  await user.click(await screen.findByRole("checkbox", { name: "角色介绍" }))
  expect(mocks.draftBookCharacters).not.toHaveBeenCalled()
  await user.click(screen.getByRole("button", { name: "narration.organize" }))
  expect(await screen.findByRole("checkbox", { name: /林岚/ })).toBeChecked()
  expect(mocks.draftBookCharacters).toHaveBeenCalledWith(
    "library",
    {
      book,
      input: {
        kind: "book",
        passages: [{ title: "人物介绍", text: "林岚：旅人。" }],
      },
    },
    expect.any(Function),
    expect.any(AbortSignal),
  )
  expect(mocks.saveBookNarration).not.toHaveBeenCalled()
})

it("requires a source selection when encyclopedia search returns several works", async () => {
  mocks.getBookNarration.mockResolvedValue({ ...settings, enabled: true })
  const sources = [
    { title: "Novel", url: "https://zh.wikipedia.org/w/index.php?curid=1" },
    {
      title: "Adaptation",
      url: "https://zh.wikipedia.org/w/index.php?curid=2",
    },
  ]
  mocks.searchBookCharacterSources.mockResolvedValue(sources)
  mocks.draftBookCharacters.mockResolvedValue([
    { ...settings.characters[1], id: "" },
  ])
  mount()
  const user = userEvent.setup()
  await openCharacters()
  await user.click(await screen.findByRole("button", { name: "narration.add" }))
  await user.click(screen.getByRole("menuitem", { name: "narration.import" }))
  await user.click(screen.getByRole("button", { name: "narration.search" }))
  await screen.findByRole("button", { name: "Novel" })
  expect(
    screen.getByRole("button", { name: "narration.organize" }),
  ).toBeDisabled()
  expect(mocks.draftBookCharacters).not.toHaveBeenCalled()
  await user.click(screen.getByRole("button", { name: "Novel" }))
  await user.click(screen.getByRole("button", { name: "narration.organize" }))
  await screen.findByRole("button", { name: "narration.importSelected" })
  expect(mocks.draftBookCharacters).toHaveBeenCalledWith(
    "library",
    {
      book,
      input: { kind: "encyclopedia", source: sources[0] },
    },
    expect.any(Function),
    expect.any(AbortSignal),
  )
})

it("uses the user's prompt to draft candidates without automatically saving", async () => {
  mocks.getBookNarration.mockResolvedValue({ ...settings, enabled: true })
  mocks.draftBookCharacters.mockResolvedValue([
    { ...settings.characters[1], id: "" },
  ])
  mount()
  const user = userEvent.setup()
  await openCharacters()
  await user.click(await screen.findByRole("button", { name: "narration.add" }))
  await user.click(screen.getByRole("menuitem", { name: "narration.organize" }))
  await user.type(
    screen.getByLabelText("narration.prompt"),
    "陈默是老师，请整理人物身份。",
  )
  await user.click(screen.getByRole("button", { name: "narration.organize" }))
  await screen.findByRole("button", { name: "narration.importSelected" })
  expect(mocks.draftBookCharacters).toHaveBeenCalledWith(
    "library",
    {
      book,
      input: { kind: "prompt", prompt: "陈默是老师，请整理人物身份。" },
    },
    expect.any(Function),
    expect.any(AbortSignal),
  )
  expect(mocks.saveBookNarration).not.toHaveBeenCalled()
})

it("uses bookmark-style multi-selection to delete characters in one save and protects the narrator", async () => {
  mocks.getBookNarration.mockResolvedValue({
    ...settings,
    enabled: true,
    characters: [
      ...settings.characters,
      { ...settings.characters[1], id: "lin", name: "林岚" },
    ],
  })
  mount()
  await openCharacters()
  fireEvent.contextMenu(
    screen.getByRole("button", { name: /narration.narrator/ }),
  )
  expect(
    screen.queryByRole("menuitem", { name: "common.delete" }),
  ).not.toBeInTheDocument()
  fireEvent.contextMenu(screen.getByRole("button", { name: /^陈默/ }))
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "narration.select" }),
  )
  fireEvent.click(screen.getByRole("button", { name: "common.selectAll" }))
  expect(
    screen.getByRole("button", { name: /narration.narrator/ }),
  ).toBeDisabled()
  expect(screen.getByRole("button", { name: /^陈默/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  expect(screen.getByRole("button", { name: /^林岚/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  fireEvent.click(
    screen.getByRole("button", { name: "narration.deleteSelected" }),
  )
  await waitFor(() => expect(mocks.saveBookNarration).toHaveBeenCalledTimes(1))
  expect(mocks.saveBookNarration).toHaveBeenCalledWith(
    "library",
    expect.objectContaining({ characters: [settings.characters[0]] }),
  )
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: /^陈默/ }),
    ).not.toBeInTheDocument(),
  )
  expect(
    screen.getByRole("button", { name: /narration.narrator/ }),
  ).toBeEnabled()
})

it("exits selection with Escape and keeps failed deletions available for retry", async () => {
  mocks.getBookNarration.mockResolvedValue({ ...settings, enabled: true })
  mocks.saveBookNarration.mockRejectedValueOnce(new Error("Could not save"))
  mount()
  await openCharacters()
  fireEvent.contextMenu(screen.getByRole("button", { name: /^陈默/ }))
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "narration.select" }),
  )
  fireEvent.keyDown(window, { key: "Escape" })
  expect(
    screen.queryByRole("button", { name: "narration.deleteSelected" }),
  ).not.toBeInTheDocument()
  expect(mocks.saveBookNarration).not.toHaveBeenCalled()
  fireEvent.contextMenu(screen.getByRole("button", { name: /^陈默/ }))
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "narration.select" }),
  )
  fireEvent.click(
    screen.getByRole("button", { name: "narration.deleteSelected" }),
  )
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save")
  expect(screen.getByRole("button", { name: /^陈默/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  fireEvent.click(
    screen.getByRole("button", { name: "narration.deleteSelected" }),
  )
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: /^陈默/ }),
    ).not.toBeInTheDocument(),
  )
})

it("opens a separate add form and returns to the character list after saving", async () => {
  mocks.getBookNarration.mockResolvedValue({ ...settings, enabled: true })
  mount()
  await openCharacters()
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: "narration.add" }))
  await user.click(
    screen.getByRole("menuitem", { name: "narration.manualAdd" }),
  )
  expect(
    screen.queryByRole("button", { name: /^陈默/ }),
  ).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText(/narration.name/), {
    target: { value: "林岚" },
  })
  fireEvent.click(screen.getByRole("button", { name: "common.save" }))
  expect(
    await screen.findByRole("button", { name: /^林岚/ }),
  ).toBeInTheDocument()
  expect(screen.getByRole("button", { name: /^陈默/ })).toBeInTheDocument()
  expect(screen.queryByLabelText(/narration.name/)).not.toBeInTheDocument()
})

it("hides adding while selecting and restores it after leaving selection", async () => {
  mocks.getBookNarration.mockResolvedValue({ ...settings, enabled: true })
  mount()
  await openCharacters()
  expect(screen.getByRole("button", { name: "narration.add" })).toBeVisible()
  const select = screen.getByRole("button", { name: "narration.select" })
  expect(select).toHaveAttribute("aria-pressed", "false")
  expect(
    screen.queryByRole("button", { name: "narration.deleteSelected" }),
  ).not.toBeInTheDocument()
  fireEvent.click(select)
  const deleteButton = screen.getByRole("button", {
    name: "narration.deleteSelected",
  })
  expect(deleteButton).toBeDisabled()
  expect(
    screen.getByRole("button", { name: "narration.deselect" }),
  ).toHaveAttribute("aria-pressed", "true")
  expect(
    screen.queryByRole("button", { name: "narration.add" }),
  ).not.toBeInTheDocument()
  const character = screen.getByRole("button", { name: /^陈默/ })
  fireEvent.click(character)
  expect(character).toHaveAttribute("aria-pressed", "true")
  expect(deleteButton).toBeEnabled()
  fireEvent.click(character)
  expect(character).toHaveAttribute("aria-pressed", "false")
  expect(deleteButton).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "narration.deselect" }))
  expect(
    screen.queryByRole("button", { name: "narration.deleteSelected" }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole("button", { name: "narration.select" }),
  ).toHaveAttribute("aria-pressed", "false")
  expect(screen.getByRole("button", { name: "narration.add" })).toBeVisible()
  fireEvent.click(character)
  expect(screen.getByLabelText(/narration.name/)).toHaveValue("陈默")
  expect(mocks.saveBookNarration).not.toHaveBeenCalled()
})
