import type { EpubNavigator } from "@readium/navigator"
import {
  type Decoration,
  type DecoratorRequest,
  Layout,
  Width,
} from "@readium/navigator-html-injectables"
import type { Locator } from "@readium/shared"

const SEARCH_DECORATION_GROUP = "search"
const ACTIVE_SEARCH_DECORATION_ID = "active-search-result"
const SEARCH_HIGHLIGHT_OPACITY = 0.3

function translucentTint(tint: string): string {
  const hex = tint.trim().replace(/^#/, "")
  if (!/^[\da-f]{6}$/i.test(hex)) return tint

  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${SEARCH_HIGHLIGHT_OPACITY})`
}

function sendDecorationRequest(
  navigator: EpubNavigator,
  request: DecoratorRequest,
): boolean {
  let sent = false
  navigator._cframes.forEach((frame) => {
    const comms = frame?.msg
    if (!comms) return
    comms.send("decorate", request)
    sent = true
  })
  return sent
}

export function clearEpubSearchHighlight(navigator: EpubNavigator): boolean {
  return sendDecorationRequest(navigator, {
    group: SEARCH_DECORATION_GROUP,
    action: "clear",
    decoration: undefined,
  })
}

export function applyEpubSearchHighlight(
  navigator: EpubNavigator,
  locator: Locator,
  themeAccent: string,
): boolean {
  clearEpubSearchHighlight(navigator)

  const decoration: Decoration = {
    id: ACTIVE_SEARCH_DECORATION_ID,
    locator,
    style: {
      tint: translucentTint(themeAccent),
      layout: Layout.Boxes,
      width: Width.Wrap,
    },
  }

  return sendDecorationRequest(navigator, {
    group: SEARCH_DECORATION_GROUP,
    action: "add",
    decoration,
  })
}
