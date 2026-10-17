import { pinyin } from "pinyin-pro"

export const FACET_KINDS = ["authors", "tags", "series"] as const
export type CatalogFacetKind = (typeof FACET_KINDS)[number]
export type CatalogToken = { kind: CatalogFacetKind; value: string }
export type CatalogCover = {
  id: number
  title: string
  path: string
  hasCover: boolean
}
export type CatalogFacet = {
  name: string
  bookCount: number
  covers: CatalogCover[]
}
export type CatalogNavigation = Record<CatalogFacetKind, CatalogFacet[]>
export const EMPTY_NAVIGATION: CatalogNavigation = {
  authors: [],
  tags: [],
  series: [],
}

export function isFacetKind(value: unknown): value is CatalogFacetKind {
  return FACET_KINDS.some((kind) => kind === value)
}

export function tokenKey(token: CatalogToken): string {
  return JSON.stringify([token.kind, token.value])
}

export function parseCatalogTokens(value: unknown): CatalogToken[] {
  if (typeof value === "string") {
    try {
      return parseCatalogTokens(JSON.parse(value))
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value
    .filter((token): token is CatalogToken => {
      if (
        !token ||
        !isFacetKind(token.kind) ||
        typeof token.value !== "string" ||
        !token.value.trim()
      )
        return false
      const key = tokenKey(token)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map(({ kind, value: name }) => ({ kind, value: name }))
}

export function catalogQuery(tokens: CatalogToken[], search = "") {
  const selected = parseCatalogTokens(tokens)
  return {
    authors: selected
      .filter((token) => token.kind === "authors")
      .map((token) => token.value),
    tags: selected
      .filter((token) => token.kind === "tags")
      .map((token) => token.value),
    series: selected
      .filter((token) => token.kind === "series")
      .map((token) => token.value),
    search: search.trim() || null,
    bookIds: null as number[] | null,
    sortBy: null as string | null,
    offset: 0,
    limit: null as number | null,
  }
}

export function catalogSuggestions(
  navigation: CatalogNavigation,
  text: string,
  tokens: CatalogToken[],
  kind?: CatalogFacetKind,
): CatalogToken[] {
  const needle = text.trim().toLocaleLowerCase()
  if (!needle) return []
  const selected = new Set(tokens.map(tokenKey))
  return (kind ? [kind] : FACET_KINDS)
    .flatMap((group) =>
      navigation[group]
        .filter((facet) => facet.name.toLocaleLowerCase().includes(needle))
        .map((facet) => ({ kind: group, value: facet.name })),
    )
    .filter((token) => !selected.has(tokenKey(token)))
}

const collator = new Intl.Collator("zh-Hans-u-co-pinyin", {
  numeric: true,
  sensitivity: "base",
})
export function catalogInitial(name: string): string {
  const first =
    pinyin(name.trim(), {
      pattern: "first",
      toneType: "none",
      type: "array",
    })[0] ?? ""
  const letter = first
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .charAt(0)
    .toUpperCase()
  return /^[A-Z]$/.test(letter) ? letter : "#"
}

export function groupCatalogFacets(facets: CatalogFacet[]) {
  const groups = new Map<string, CatalogFacet[]>()
  for (const facet of facets) {
    const key = catalogInitial(facet.name)
    const group = groups.get(key) ?? []
    group.push(facet)
    groups.set(key, group)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)))
    .map(([title, data]) => ({
      title,
      data: data.sort((a, b) => collator.compare(a.name, b.name)),
    }))
}
