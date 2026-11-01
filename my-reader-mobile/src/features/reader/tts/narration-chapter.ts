import { publication, type Locator } from "@my-reader/readium"
import { hrefRoughlyMatches } from "@my-reader/tools/reader-toc"
import { narrationSourceKey } from "@my-reader/tools/narration-plan"
import type { NarrationRequest } from "my-reader-core"
import { analyzeBookNarration } from "@/src/services/core/narration"
import type { NarrationBookContext } from "./narration-playback"

const listeners = new Set<() => void>()
export function subscribeReadingPlan(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function readingPlanChanged() {
  listeners.forEach((listener) => listener())
}

export function narrationRequest(
  book: NarrationBookContext,
  locator: Locator,
  text: string,
): NarrationRequest {
  const hrefs = [...new Set(book.positions.map((item) => item.href))]
  const index = hrefs.findIndex((href) =>
    hrefRoughlyMatches(href, locator.href),
  )
  return {
    bookId: book.bookId,
    contentVersion: book.contentVersion,
    sourceKey: narrationSourceKey(locator),
    text,
    before: "",
    after: "",
    position:
      locator.locations?.totalProgression ??
      (Math.max(0, index) + (locator.locations?.progression ?? 0)) /
        Math.max(1, hrefs.length),
  }
}

export async function loadNarrationChapter(
  book: NarrationBookContext,
  locator: Locator,
): Promise<NarrationRequest[]> {
  if (!book.publicationId) return []
  const key = locator.href.split("#")[0]!
  let pending = book.chapters?.get(key)
  if (!pending) {
    pending = publication
      .getTtsContent(book.publicationId, { href: key, type: locator.type })
      .then((content) =>
        content.utterances.map((unit) =>
          narrationRequest(book, unit.locator, unit.text),
        ),
      )
    book.chapters?.set(key, pending)
    pending.catch(() => book.chapters?.delete(key))
  }
  return pending
}

export async function analyzeNarrationChapter(
  book: NarrationBookContext,
  locator: Locator,
  signal: AbortSignal,
) {
  const requests = await loadNarrationChapter(book, locator)
  if (signal.aborted)
    throw Object.assign(new Error("Aborted"), { name: "AbortError" })
  const key = locator.href.split("#")[0]!
  let analysis = book.analysis?.get(key)
  if (!analysis && requests.length) {
    analysis = analyzeBookNarration(book.library, requests, signal).then(() => {
      readingPlanChanged()
    })
    book.analysis?.set(key, analysis)
    analysis.catch(() => book.analysis?.delete(key))
  }
  await analysis
  return requests
}

export function matchNarrationRequest(
  requests: NarrationRequest[],
  locator: Locator,
  text: string,
) {
  const key = narrationSourceKey(locator)
  const exact = requests.find(
    (request) => request.sourceKey === key && request.text === text,
  )
  if (exact) return exact
  const selector =
    locator.locations?.cssSelector ??
    locator.locations?.domRange?.start.cssSelector
  if (!selector) return undefined
  const matches = requests.filter((request) => {
    if (!request.text.endsWith(text)) return false
    const source = JSON.parse(request.sourceKey) as Locator
    return (
      hrefRoughlyMatches(source.href, locator.href) &&
      (source.locations?.cssSelector ??
        source.locations?.domRange?.start.cssSelector) === selector &&
      (!locator.text?.before || locator.text.before === source.text?.before) &&
      (!locator.text?.after || locator.text.after === source.text?.after)
    )
  })
  return matches.length === 1 ? matches[0] : undefined
}
