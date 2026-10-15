import "@/i18n"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import {
  CatalogTokenField,
  type CatalogTokenFieldProps,
} from "../CatalogTokenField"

vi.mock("@/hooks/useDebouncedValue", () => ({
  useDebouncedValue: vi.fn((value: string) => value),
}))

const navigation = {
  authors: [{ name: "Author, Jr.", bookCount: 2, covers: [] }],
  tags: ["标签 A", "标签 B"].map((name) => ({
    name,
    bookCount: 2,
    covers: [],
  })),
  series: [{ name: "Series A", bookCount: 1, covers: [] }],
}

function setup(overrides: Partial<CatalogTokenFieldProps> = {}) {
  const props = {
    tokens: [],
    onTokensChange: vi.fn(),
    navigation,
    searchQuery: "",
    onSearchChange: vi.fn(),
    ...overrides,
  }
  const view = render(<CatalogTokenField {...props} />)
  return { ...view, props, input: screen.getByRole("combobox") }
}

describe("CatalogTokenField", () => {
  beforeEach(() => {
    vi.mocked(useDebouncedValue)
      .mockReset()
      .mockImplementation((value) => value)
  })

  it.each([
    "",
    " \t ",
  ])("keeps suggestions closed when focusing blank input %j", (searchQuery) => {
    const { input } = setup({ searchQuery })
    fireEvent.focus(input)
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    expect(input).toHaveAttribute("aria-expanded", "false")
  })

  it.each([
    "",
    " \t ",
  ])("hides suggestions immediately when input becomes %j", (searchQuery) => {
    const { props, input, rerender } = setup({ searchQuery: "Author" })
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: "ArrowDown" })
    expect(screen.getByRole("option")).toHaveTextContent("Author, Jr.")
    vi.mocked(useDebouncedValue).mockReturnValue("Author")
    rerender(<CatalogTokenField {...props} searchQuery={searchQuery} />)
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    fireEvent.keyDown(input, { key: "Enter" })
    expect(props.onTokensChange).not.toHaveBeenCalled()
  })

  it("commits a selected suggestion and clears its draft in one update, preserving other conditions", () => {
    const tokens = [{ kind: "tags" as const, value: "标签 A" }]
    const { props, input } = setup({ tokens, searchQuery: "Author, Jr." })
    fireEvent.focus(input)
    fireEvent.click(screen.getByRole("option", { name: /Author, Jr\./ }))
    expect(props.onTokensChange).toHaveBeenCalledExactlyOnceWith(
      [...tokens, { kind: "authors", value: "Author, Jr." }],
      "",
    )
    expect(props.onSearchChange).not.toHaveBeenCalled()
  })

  it.each([
    "Author, Jr.",
    "标签 A",
    "Series A",
    "unknown, name",
  ])("submits %j as free text without adding a suggested condition", (searchQuery) => {
    const { props, input } = setup({
      tokens: [{ kind: "tags", value: "标签 B" }],
      searchQuery,
    })
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: "Enter" })
    expect(props.onTokensChange).not.toHaveBeenCalled()
    expect(props.onSearchChange).not.toHaveBeenCalled()
    expect(input).toHaveValue(searchQuery)
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    fireEvent.change(input, { target: { value: `${searchQuery} text` } })
    expect(props.onSearchChange).toHaveBeenCalledWith(`${searchQuery} text`)
  })

  it("keeps a comma as text even when a suggestion is highlighted", () => {
    const { props, input } = setup({ searchQuery: "Author, Jr." })
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: "ArrowDown" })
    expect(fireEvent.keyDown(input, { key: "," })).toBe(true)
    expect(props.onTokensChange).not.toHaveBeenCalled()
  })

  it("keeps unmatched text and punctuation as free text", () => {
    const { props, input } = setup({ searchQuery: "not a facet" })
    fireEvent.keyDown(input, { key: "," })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(props.onTokensChange).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: "not a facet, still text" } })
    expect(props.onSearchChange).toHaveBeenCalledWith("not a facet, still text")
  })

  it("offers categorized keyboard suggestions and ignores IME confirmation", () => {
    const { props, input } = setup({ searchQuery: "标签" })
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: "ArrowDown" })
    expect(
      screen.getByRole("option", { name: /标签\s*标签 A/ }),
    ).toHaveAttribute("aria-selected", "true")
    fireEvent.keyDown(input, { key: "Enter", isComposing: true })
    expect(props.onTokensChange).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: "Enter" })
    expect(props.onTokensChange).toHaveBeenCalledWith(
      [{ kind: "tags", value: "标签 A" }],
      "",
    )
  })

  it.each([
    "escape",
    "blur",
  ])("forgets a highlighted suggestion after %s", (action) => {
    const { props, input } = setup({ searchQuery: "标签" })
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: "ArrowDown" })
    if (action === "escape") fireEvent.keyDown(input, { key: "Escape" })
    else fireEvent.blur(input)
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: "Enter" })
    expect(props.onTokensChange).not.toHaveBeenCalled()
  })

  it("reopens suggestions when typing after submitting a free-text search", () => {
    const { props, input, rerender } = setup({ searchQuery: "Author, Jr." })
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: "Enter" })
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    fireEvent.change(input, { target: { value: "标签" } })
    rerender(<CatalogTokenField {...props} searchQuery="标签" />)
    expect(
      screen.getByRole("option", { name: /标签\s*标签 A/ }),
    ).toBeInTheDocument()
  })

  it("selects the last token on backspace and removes only that token on the next press", () => {
    const { props, input } = setup({
      tokens: [
        { kind: "tags", value: "标签 A" },
        { kind: "tags", value: "标签 B" },
      ],
    })
    input.focus()
    fireEvent.keyDown(input, { key: "Backspace" })
    const token = screen.getByRole("button", { name: "标签: 标签 B" })
    expect(token).toHaveFocus()
    expect(props.onTokensChange).not.toHaveBeenCalled()
    fireEvent.keyDown(token, { key: "Backspace" })
    expect(props.onTokensChange).toHaveBeenCalledWith([
      { kind: "tags", value: "标签 A" },
    ])
  })

  it.each([
    { kind: "authors" as const, value: "Author, Jr.", label: "作者" },
    { kind: "tags" as const, value: "标签 A", label: "标签" },
    { kind: "series" as const, value: "Series A", label: "丛书" },
  ])("only offers removal for an existing $kind condition", async ({
    kind,
    value,
    label,
  }) => {
    const remaining = { kind: "tags" as const, value: "标签 B" }
    const { props, input } = setup({
      tokens: [{ kind, value }, remaining],
      searchQuery: "Book title",
    })
    const token = screen.getByRole("button", { name: `${label}: ${value}` })
    fireEvent.doubleClick(token)
    expect(input).toHaveValue("Book title")
    expect(props.onTokensChange).not.toHaveBeenCalled()
    expect(props.onSearchChange).not.toHaveBeenCalled()
    const user = userEvent.setup()
    await user.click(token)
    expect(screen.getAllByRole("menuitem")).toHaveLength(1)
    await user.click(screen.getByRole("menuitem", { name: "移除条件" }))
    expect(props.onTokensChange).toHaveBeenCalledExactlyOnceWith([remaining])
    expect(props.onSearchChange).not.toHaveBeenCalled()
    expect(input).toHaveValue("Book title")
  })
})
