import type { EpubNavigator } from "@readium/navigator"
import {
  type Decoration,
  type DecoratorRequest,
  Layout,
  Width,
} from "@readium/navigator-html-injectables"
import type { Locator } from "@readium/shared"

const TTS_DECORATION_GROUP = "tts-utterance"
const TTS_DECORATION_ID = "tts-current-utterance"

function send(navigator: EpubNavigator, request: DecoratorRequest): boolean {
  let sent = false
  navigator._cframes.forEach((frame) => {
    if (!frame?.msg) return
    frame.msg.send("decorate", request)
    sent = true
  })
  return sent
}

export function clearEpubTtsHighlight(navigator: EpubNavigator): boolean {
  return send(navigator, {
    group: TTS_DECORATION_GROUP,
    action: "clear",
    decoration: undefined,
  })
}

export function applyEpubTtsHighlight(
  navigator: EpubNavigator,
  locator: Locator,
  tint: string,
): boolean {
  clearEpubTtsHighlight(navigator)
  const decoration: Decoration = {
    id: TTS_DECORATION_ID,
    locator,
    style: {
      tint,
      layout: Layout.Boxes,
      width: Width.Wrap,
    },
  }
  return send(navigator, {
    group: TTS_DECORATION_GROUP,
    action: "add",
    decoration,
  })
}
