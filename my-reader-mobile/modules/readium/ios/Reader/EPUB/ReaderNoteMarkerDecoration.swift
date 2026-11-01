import ReadiumNavigator
import UIKit

let readerNoteMarkerStyleId: Decoration.Style.Id = "myreader-note-marker"
let readerNarrationStyleId: Decoration.Style.Id = "myreader-narration"

func readerNarrationStyle(tint: String?) -> Decoration.Style {
  Decoration.Style(id: readerNarrationStyleId, config: ReaderNoteMarkerStyleConfig(tint: tint.flatMap(UIColor.fromCSS) ?? .systemYellow))
}

func readerNarrationTemplate() -> HTMLDecorationTemplate {
  HTMLDecorationTemplate(layout: .boxes, width: .wrap, element: { decoration in
    let tint = (decoration.style.config as? ReaderNoteMarkerStyleConfig)?.tint.cssHex ?? "#D9A928"
    let name = (decoration.userInfo["characterName"] as? String ?? "").readerHTMLAttributeEscaped
    return "<div data-myreader-overlay=\"true\" class=\"myreader-narration-mark\" style=\"background: \(tint)33 !important\"><span style=\"background: \(tint)99 !important\">\(name)</span></div>"
  }, stylesheet: """
  .myreader-narration-mark { height: 100%; pointer-events: none; }
  .myreader-narration-mark > span { position: absolute; top: 0; right: 0; transform: translateY(-75%); padding: 1px 4px; border-radius: 3px; font: 10px/1.2 sans-serif; color: inherit; white-space: nowrap; max-width: 10em; overflow: hidden; text-overflow: ellipsis; }
  .myreader-narration-mark:not(:first-child) > span { display: none; }
  """)
}

struct ReaderNoteMarkerStyleConfig: Hashable {
  let tint: UIColor
}

func readerNoteMarkerStyle(tint: String?) -> Decoration.Style {
  Decoration.Style(
    id: readerNoteMarkerStyleId,
    config: ReaderNoteMarkerStyleConfig(
      tint: tint.flatMap(UIColor.fromCSS) ?? UIColor(red: 0.85, green: 0.66, blue: 0.16, alpha: 1)
    )
  )
}

func readerNoteMarkerTemplate() -> HTMLDecorationTemplate {
  HTMLDecorationTemplate(
    layout: .boxes,
    width: .wrap,
    element: { decoration in
      let config = decoration.style.config as? ReaderNoteMarkerStyleConfig
      let tint = config?.tint.cssHex ?? "#D9A928"
      let accessibilityLabel =
        (decoration.userInfo["accessibilityLabel"] as? String ?? "Open note")
          .readerHTMLAttributeEscaped
      return ReaderNoteMarkerTemplateSource.element
        .replacingOccurrences(of: "{{accessibilityLabel}}", with: accessibilityLabel)
        .replacingOccurrences(of: "{{tint}}", with: tint)
    },
    stylesheet: ReaderNoteMarkerTemplateSource.stylesheet
      .replacingOccurrences(of: "{{hitSize}}", with: "44")
      .replacingOccurrences(of: "{{hitOffset}}", with: "22")
  )
}

private extension String {
  var readerHTMLAttributeEscaped: String {
    replacingOccurrences(of: "&", with: "&amp;")
      .replacingOccurrences(of: "\"", with: "&quot;")
      .replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;")
  }
}
