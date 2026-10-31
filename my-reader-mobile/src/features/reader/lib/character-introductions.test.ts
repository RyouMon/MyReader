import { publication, search, type Locator } from "@my-reader/readium"
import { findCharacterIntroductions } from "./character-introductions"

jest.mock("@my-reader/readium", () => ({
  publication: { getSnapshot: jest.fn(), getContent: jest.fn() },
  search: {
    getCapabilities: jest.fn(),
    search: jest.fn(),
    next: jest.fn(),
    cancel: jest.fn(),
  },
}))
const locator = (href: string, title?: string): Locator => ({
  href,
  title,
  type: "application/xhtml+xml",
  locations: {},
})
const passage = (href: string, text: string) => ({
  text,
  locator: locator(href),
})
beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(publication.getSnapshot).mockResolvedValue({
    tableOfContents: [],
  } as never)
  jest.mocked(search.getCapabilities).mockResolvedValue({
    searchable: true,
  } as never)
  jest.mocked(search.search).mockResolvedValue({ id: "search" } as never)
  jest.mocked(search.next).mockResolvedValue({ locators: [], done: true })
})

it("uses Readium search, deduplicates chapters and sends only introduction text", async () => {
  jest.mocked(search.next).mockResolvedValue({
    locators: [locator("cast.xhtml#heading"), locator("cast.xhtml#alice")],
    done: true,
  })
  jest.mocked(publication.getContent).mockResolvedValue({
    utterances: [
      passage("cast.xhtml", "人物介绍"),
      passage("cast.xhtml", "小周：高中生。"),
      passage("chapter.xhtml", "This is the rest of the novel."),
    ],
  } as never)
  const result = await findCharacterIntroductions(
    "book",
    new AbortController().signal,
  )
  expect(search.search).toHaveBeenCalledWith("book", "人物介绍")
  expect(search.cancel).toHaveBeenCalledTimes(
    jest.mocked(search.search).mock.calls.length,
  )
  expect(publication.getContent).toHaveBeenCalledTimes(1)
  expect(result).toEqual([
    { id: "cast.xhtml", title: "人物介绍", text: "人物介绍\n小周：高中生。" },
  ])
})

it("uses a nested TOC introduction on a nonsearchable book and accepts Android content", async () => {
  jest.mocked(publication.getSnapshot).mockResolvedValue({
    tableOfContents: [
      { href: "volume", children: [{ href: "cast.xhtml", title: "登場人物" }] },
    ],
  } as never)
  jest
    .mocked(search.getCapabilities)
    .mockResolvedValue({ searchable: false } as never)
  jest.mocked(publication.getContent).mockResolvedValue({
    content: [passage("cast.xhtml", "小周：高中生。")],
  } as never)
  expect(
    await findCharacterIntroductions("book", new AbortController().signal),
  ).toEqual([{ id: "cast.xhtml", title: "登場人物", text: "小周：高中生。" }])
  expect(search.search).not.toHaveBeenCalled()
})

it("returns no introduction for an ordinary prose match or an image-only chapter", async () => {
  jest.mocked(search.next).mockResolvedValue({
    locators: [locator("chapter.xhtml"), locator("image.xhtml", "人物介绍")],
    done: true,
  })
  jest.mocked(publication.getContent).mockImplementation(
    async (_id, value) =>
      ({
        utterances:
          value?.href === "image.xhtml"
            ? [passage("image.xhtml", "人物介绍")]
            : [passage("chapter.xhtml", "他看了这篇文章，随后回到教室。")],
      }) as never,
  )
  expect(
    await findCharacterIntroductions("book", new AbortController().signal),
  ).toEqual([])
})

it("cancels an active native search when the page is left", async () => {
  const controller = new AbortController()
  jest.mocked(search.next).mockImplementation(async () => {
    controller.abort()
    return { locators: [], done: false }
  })
  await expect(
    findCharacterIntroductions("book", controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" })
  expect(search.cancel).toHaveBeenCalledWith("search")
  expect(publication.getContent).not.toHaveBeenCalled()
})
