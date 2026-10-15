import { describe, expect, it } from "vitest"
import {
  catalogInitial,
  catalogQuery,
  catalogSuggestions,
  EMPTY_NAVIGATION,
  FACET_KINDS,
  groupCatalogFacets,
  parseCatalogTokens,
} from "./catalog-navigation"

describe("catalog navigation", () => {
  it("keeps names exact, deduplicates tokens and sends every value in its AND group", () => {
    const tokens = parseCatalogTokens(
      '[{"kind":"tags","value":"标签 A"},{"kind":"tags","value":"标签 B"},{"kind":"tags","value":"标签 A"},{"kind":"authors","value":"A, B"},{"kind":"unknown","value":"x"}]',
    )
    expect(catalogQuery(tokens).tags).toEqual(["标签 A", "标签 B"])
    expect(catalogQuery(tokens).authors).toEqual(["A, B"])
    expect(parseCatalogTokens("invalid")).toEqual([])
  })
  it("suggests distinct categories and excludes already selected exact tokens", () => {
    const facet = { name: "A, B", bookCount: 1, covers: [] }
    expect(
      catalogSuggestions(
        { ...EMPTY_NAVIGATION, authors: [facet], tags: [facet] },
        "A,",
        [{ kind: "authors", value: "A, B" }],
      ),
    ).toEqual([{ kind: "tags", value: "A, B" }])
  })
  it.each(["", " \t "])("offers no suggestions for blank input %j", (text) => {
    const facet = { name: "A, B", bookCount: 1, covers: [] }
    const navigation = { authors: [facet], tags: [facet], series: [facet] }
    expect(catalogSuggestions(navigation, text, [])).toEqual([])
    for (const kind of FACET_KINDS) {
      expect(catalogSuggestions(navigation, text, [], kind)).toEqual([])
    }
  })
  it("indexes Chinese by pinyin, Latin by letter and other names under #", () => {
    expect(["刘慈欣", "张三", "Émile", "9 Lives"].map(catalogInitial)).toEqual([
      "L",
      "Z",
      "E",
      "#",
    ])
    expect(
      groupCatalogFacets(
        ["9 Lives", "张三", "Alice", "刘慈欣"].map((name) => ({
          name,
          bookCount: 1,
          covers: [],
        })),
      ).map((g) => g.title),
    ).toEqual(["A", "L", "Z", "#"])
  })
})
