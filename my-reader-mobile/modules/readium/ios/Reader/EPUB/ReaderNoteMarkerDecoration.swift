import ReadiumNavigator
import UIKit

let readerNoteMarkerStyleId: Decoration.Style.Id = "myreader-note-marker"

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
