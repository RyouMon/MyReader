import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { api } from "@/lib/tauri-api"
import type { BookCharacterDto, LlmStreamEventDto } from "@/lib/tauri-specta"
import { CharacterImportPanel } from "../CharacterImportPanel"

vi.mock("@/lib/tauri-api", () => ({
  api: {
    getBookNarration: vi.fn().mockResolvedValue({}),
    draftBookCharacters: vi.fn(),
  },
}))
vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}))
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => vi.unstubAllGlobals())

function mount(onImport: (characters: BookCharacterDto[]) => void) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CharacterImportPanel
        book={{
          libraryId: "library",
          bookId: 1,
          title: "Book",
          authors: [],
          language: "zh",
        }}
        mode="prompt"
        saving={false}
        onImport={onImport}
      />
    </QueryClientProvider>,
  )
  fireEvent.change(screen.getByLabelText("narration.prompt"), {
    target: { value: "林岚：旅人。" },
  })
  fireEvent.click(screen.getByRole("button", { name: "narration.organize" }))
}

it("replaces the waiting label with live text, then shows only validated candidates", async () => {
  let emit!: (event: LlmStreamEventDto) => void
  let finish!: (characters: BookCharacterDto[]) => void
  vi.mocked(api.draftBookCharacters).mockImplementationOnce(
    (_library, _request, progress) => {
      emit = progress!
      return new Promise((resolve) => {
        finish = resolve
      })
    },
  )
  const onImport = vi.fn()
  mount(onImport)
  await screen.findByRole("status", { name: "narration.organizing" })
  act(() => emit({ kind: "reasoning", delta: "核对人物介绍\n正在整理林岚" }))
  expect(screen.getByText("核对人物介绍 正在整理林岚")).toBeVisible()
  expect(
    screen.queryByRole("button", { name: "narration.importSelected" }),
  ).not.toBeInTheDocument()
  expect(onImport).not.toHaveBeenCalled()
  await act(async () =>
    finish([
      {
        id: "",
        name: "林岚",
        nicknames: [],
        description: "旅人",
        source: null,
        voice: null,
        instructions: "",
      },
    ]),
  )
  await screen.findByRole("button", { name: "narration.importSelected" })
  await waitFor(() =>
    expect(screen.queryByRole("status")).not.toBeInTheDocument(),
  )
  expect(screen.getByText("林岚")).toBeVisible()
  expect(onImport).not.toHaveBeenCalled()
})

it("requires an explicit selection when every candidate already exists", async () => {
  const candidate: BookCharacterDto = {
    id: "stable-id",
    name: "林岚",
    nicknames: [],
    description: "旅人",
    source: null,
    voice: null,
    instructions: "",
  }
  vi.mocked(api.draftBookCharacters).mockResolvedValueOnce([candidate])
  const onImport = vi.fn()
  mount(onImport)
  const importButton = await screen.findByRole("button", {
    name: "narration.importSelected",
  })
  const checkbox = screen.getByRole("checkbox", {
    name: "narration.replaceCharacter",
  })
  expect(importButton).toBeDisabled()
  expect(checkbox).not.toBeChecked()
  fireEvent.click(checkbox)
  expect(importButton).toBeEnabled()
  expect(screen.getByText("narration.willReplace")).toBeVisible()
  fireEvent.click(checkbox)
  expect(importButton).toBeDisabled()
  expect(screen.getByText("narration.alreadyExists")).toBeVisible()
  fireEvent.click(checkbox)
  fireEvent.click(importButton)
  expect(onImport).toHaveBeenCalledExactlyOnceWith([candidate])
})
