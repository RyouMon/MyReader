import type { EpubNavigator } from "@readium/navigator"
import { Layout, Width } from "@readium/navigator-html-injectables"
import { Locator } from "@readium/shared"
import { READER_ANNOTATION_COLORS } from "@my-reader/tools/reader-annotations"
import {
  narrationCharacterColor,
  narrationPlanLocator,
  type ReadingPlanEntry,
} from "@my-reader/tools/narration-plan"
import {
  frameResourceHref,
  resourceMatches,
  textRangeForLocator,
} from "./epubAnnotations"

const GROUP = "narration-plan"
const LAYER = "myreader-narration-labels"

export function applyNarrationDecorations(
  navigator: EpubNavigator,
  entries: ReadingPlanEntry[],
) {
  navigator._cframes?.forEach((frame) => {
    // This Readium version shares a CSS highlight tint within each group.
    for (const color of Object.values(READER_ANNOTATION_COLORS)) {
      frame?.msg?.send("decorate", {
        group: `${GROUP}-${color}`,
        action: "clear",
        decoration: undefined,
      })
    }
    const doc = frame?.iframe?.contentDocument
    doc?.getElementById(LAYER)?.remove()
    if (!doc || !entries.length) return
    const layer = doc.createElement("div")
    layer.id = LAYER
    layer.setAttribute("data-myreader-overlay", "")
    layer.style.cssText =
      "position:absolute;inset:0;pointer-events:none;z-index:5;contain:layout style;"
    for (const entry of entries) {
      const anchor = narrationPlanLocator(entry)
      if (!anchor || !resourceMatches(frameResourceHref(frame), anchor.href))
        continue
      const locator = Locator.deserialize(anchor)
      if (!locator) continue
      const color = narrationCharacterColor(entry.characterId)
      frame.msg?.send("decorate", {
        group: `${GROUP}-${color}`,
        action: "add",
        decoration: {
          id: entry.id,
          locator,
          style: {
            tint: `${color}33`,
            layout: Layout.Boxes,
            width: Width.Wrap,
          },
        },
      })
      const rect = textRangeForLocator(doc, anchor)?.getClientRects()[0]
      if (!rect) continue
      const tag = doc.createElement("span")
      tag.textContent = entry.characterName
      tag.style.cssText = `position:absolute;left:${rect.right + (doc.defaultView?.scrollX ?? 0)}px;top:${rect.top + (doc.defaultView?.scrollY ?? 0)}px;transform:translate(-100%,-80%);border-radius:3px;padding:1px 4px;font:11px/1.2 sans-serif;background:${color}99;color:inherit;white-space:nowrap;max-width:10em;overflow:hidden;text-overflow:ellipsis;`
      tag.style.setProperty("background-color", `${color}99`, "important")
      layer.appendChild(tag)
    }
    doc.documentElement.appendChild(layer)
  })
}
