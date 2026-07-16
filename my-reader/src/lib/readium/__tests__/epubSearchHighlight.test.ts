import type { EpubNavigator } from "@readium/navigator"
import { Layout, Width } from "@readium/navigator-html-injectables"
import { Locator, LocatorLocations, LocatorText } from "@readium/shared"
import { describe, expect, it, vi } from "vitest"
import {
  applyEpubSearchHighlight,
  clearEpubSearchHighlight,
} from "../epubSearchHighlight"

function navigatorWithDecorator() {
  const send = vi.fn()
  const navigator = {
    _cframes: [{ msg: { send } }],
  } as unknown as EpubNavigator
  return { navigator, send }
}

const locator = new Locator({
  href: "chapter.xhtml",
  type: "application/xhtml+xml",
  locations: new LocatorLocations({ progression: 0.5 }),
  text: new LocatorText({ highlight: "needle" }),
})

describe("EPUB search decorations", () => {
  it("should clear the Readium search decoration group", () => {
    const { navigator, send } = navigatorWithDecorator()

    expect(clearEpubSearchHighlight(navigator)).toBe(true)
    expect(send).toHaveBeenCalledWith("decorate", {
      group: "search",
      action: "clear",
      decoration: undefined,
    })
  })

  it("should apply a translucent theme-tinted Readium highlight", () => {
    const { navigator, send } = navigatorWithDecorator()

    expect(applyEpubSearchHighlight(navigator, locator, "#A65E2E")).toBe(true)
    expect(send).toHaveBeenLastCalledWith(
      "decorate",
      expect.objectContaining({
        group: "search",
        action: "add",
        decoration: expect.objectContaining({
          id: "active-search-result",
          locator,
          style: expect.objectContaining({
            layout: Layout.Boxes,
            width: Width.Wrap,
          }),
        }),
      }),
    )

    const tint = send.mock.calls.at(-1)?.[1].decoration.style.tint as string
    const alpha = Number(tint.match(/^rgba\(166, 94, 46, ([\d.]+)\)$/)?.[1])
    expect(alpha).toBeGreaterThan(0)
    expect(alpha).toBeLessThan(1)
  })
})
