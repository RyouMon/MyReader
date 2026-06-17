import Foundation
import ReadiumShared
import ReadiumNavigator
import UIKit

// Readium SDK type aliases (the JS-side types share these names; alias to be explicit).
typealias RDecoration = ReadiumNavigator.Decoration
typealias RLocator = ReadiumShared.Locator
typealias RLink = ReadiumShared.Link

// MARK: - Sepia theme colors (unified across iOS, Android, web)

private let sepiaBackground = "#f4ecd8"
private let sepiaText = "#5f4b32"

// MARK: - Preferences (Record → Readium)

func preferencesRecordToEPUB(_ prefs: PreferencesRecord) -> EPUBPreferences {
  // When theme is sepia and no explicit colors are set, inject the unified
  // sepia colors so the result matches Android and web exactly.
  let isSepia = prefs.theme == "sepia"
  let bgColor = prefs.backgroundColor.flatMap { ReadiumNavigator.Color(hex: $0) }
    ?? (isSepia && prefs.backgroundColor == nil ? ReadiumNavigator.Color(hex: sepiaBackground) : nil)
  let txtColor = prefs.textColor.flatMap { ReadiumNavigator.Color(hex: $0) }
    ?? (isSepia && prefs.textColor == nil ? ReadiumNavigator.Color(hex: sepiaText) : nil)

  return EPUBPreferences(
    backgroundColor: bgColor,
    columnCount: prefs.columnCount.flatMap { ColumnCount(rawValue: $0) },
    fontFamily: prefs.fontFamily.map { FontFamily(rawValue: $0) },
    fontSize: prefs.fontSize,
    fontWeight: prefs.fontWeight,
    hyphens: prefs.hyphens,
    imageFilter: prefs.imageFilter.flatMap { ImageFilter(rawValue: $0) },
    language: prefs.language.map { Language(code: .bcp47($0)) },
    letterSpacing: prefs.letterSpacing,
    ligatures: prefs.ligatures,
    lineHeight: prefs.lineHeight,
    pageMargins: prefs.pageMargins,
    paragraphIndent: prefs.paragraphIndent,
    paragraphSpacing: prefs.paragraphSpacing,
    publisherStyles: prefs.publisherStyles,
    readingProgression: prefs.readingProgression.flatMap { ReadiumNavigator.ReadingProgression(rawValue: $0) },
    scroll: prefs.scroll,
    spread: prefs.spread.flatMap { Spread(rawValue: $0) },
    textAlign: prefs.textAlign.flatMap { TextAlignment(rawValue: $0) },
    textColor: txtColor,
    textNormalization: prefs.textNormalization,
    theme: prefs.theme.flatMap { Theme(rawValue: $0) },
    typeScale: prefs.typeScale,
    verticalText: prefs.verticalText,
    wordSpacing: prefs.wordSpacing
  )
}

func preferencesRecordToPDF(_ prefs: PreferencesRecord) -> PDFPreferences {
  let isSepia = prefs.theme == "sepia"
  let bgColor = prefs.backgroundColor.flatMap { ReadiumNavigator.Color(hex: $0) }
    ?? (isSepia && prefs.backgroundColor == nil ? ReadiumNavigator.Color(hex: sepiaBackground) : nil)

  return PDFPreferences(
    backgroundColor: bgColor,
    readingProgression: prefs.readingProgression.flatMap { ReadiumNavigator.ReadingProgression(rawValue: $0) },
    scroll: prefs.scroll ?? false,
    spread: prefs.spread.flatMap { Spread(rawValue: $0) }
  )
}

// MARK: - Locator / Decoration (Record → Readium)

func locatorRecordToReadium(_ rec: LocatorRecord) -> RLocator? {
  let data = LocatorData(
    href: rec.href,
    type: rec.type,
    title: rec.title,
    locations: rec.locations.map {
      LocationsData(
        progression: $0.progression,
        position: $0.position.map { Int($0) },
        totalProgression: $0.totalProgression
      )
    },
    text: rec.text.map { TextData(before: $0.before, highlight: $0.highlight, after: $0.after) }
  )
  return data.toLocator()
}

func decorationRecordToReadium(_ rec: DecorationRecord) -> RDecoration? {
  guard let locatorRec = rec.locator,
        let readiumLocator = locatorRecordToReadium(locatorRec) else { return nil }
  guard let styleRec = rec.style else { return nil }

  let styleData = StyleData(type: styleRec.type, tint: styleRec.tint, isActive: styleRec.isActive)
  guard let readiumStyle = styleData.toDecorationStyle() else { return nil }

  var userInfo: [AnyHashable: AnyHashable] = [:]
  if let extras = rec.extras {
    for (key, value) in extras {
      userInfo[key] = value
    }
  }

  return RDecoration(
    id: rec.id,
    locator: readiumLocator,
    style: readiumStyle,
    userInfo: userInfo
  )
}

// MARK: - Readium → JS dict

func locatorToDict(_ loc: RLocator) -> [String: Any] {
  var locations: [String: Any] = ["progression": loc.locations.progression ?? 0]
  if let position = loc.locations.position {
    locations["position"] = position
  }
  if let totalProgression = loc.locations.totalProgression {
    locations["totalProgression"] = totalProgression
  }

  var dict: [String: Any] = [
    "href": loc.href.string,
    "type": loc.mediaType.string,
    "locations": locations,
  ]
  if let title = loc.title {
    dict["title"] = title
  }

  var text: [String: Any] = [:]
  if let before = loc.text.before { text["before"] = before }
  if let highlight = loc.text.highlight { text["highlight"] = highlight }
  if let after = loc.text.after { text["after"] = after }
  if !text.isEmpty {
    dict["text"] = text
  }

  return dict
}

func linkToDict(_ link: RLink, depth: Double = 0, parentHref: String? = nil, position: Double = 0) -> [String: Any] {
  var dict: [String: Any] = [
    "href": link.href,
    "depth": depth,
    "position": position,
  ]
  if let title = link.title { dict["title"] = title }
  let rels = link.rels.map { "\($0)" }
  if !rels.isEmpty { dict["rels"] = rels }
  if !link.languages.isEmpty { dict["languages"] = link.languages }
  if !link.children.isEmpty { dict["hasChildren"] = true }
  if let parentHref { dict["parentHref"] = parentHref }
  return dict
}

func flattenLinksToDicts(_ links: [RLink], depth: Double = 0, parentHref: String? = nil) -> [[String: Any]] {
  var result: [[String: Any]] = []
  for (index, link) in links.enumerated() {
    result.append(linkToDict(link, depth: depth, parentHref: parentHref, position: Double(index)))
    if !link.children.isEmpty {
      result.append(contentsOf: flattenLinksToDicts(link.children, depth: depth + 1, parentHref: link.href))
    }
  }
  return result
}

func metadataToDict(_ meta: ReadiumShared.Metadata) -> [String: Any] {
  func contributors(_ list: [ReadiumShared.Contributor]) -> [[String: Any]]? {
    guard !list.isEmpty else { return nil }
    return list.map { c in
      var d: [String: Any] = ["name": c.name]
      if let sortAs = c.sortAs { d["sortAs"] = sortAs }
      if let identifier = c.identifier { d["identifier"] = identifier }
      return d
    }
  }

  func subjects(_ list: [ReadiumShared.Subject]) -> [[String: Any]]? {
    guard !list.isEmpty else { return nil }
    return list.map { s in
      var d: [String: Any] = ["name": s.name]
      if let sortAs = s.sortAs { d["sortAs"] = sortAs }
      if let code = s.code { d["code"] = code }
      if let scheme = s.scheme { d["scheme"] = scheme }
      return d
    }
  }

  var dict: [String: Any] = [
    "title": meta.title ?? "Untitled",
    "readingProgression": meta.readingProgression.rawValue,
  ]
  if let sortAs = meta.sortAs { dict["sortAs"] = sortAs }
  if let subtitle = meta.subtitle { dict["subtitle"] = subtitle }
  if let identifier = meta.identifier { dict["identifier"] = identifier }
  if let modified = meta.modified { dict["modified"] = modified.description }
  if let published = meta.published { dict["published"] = published.description }
  if !meta.languages.isEmpty { dict["language"] = meta.languages }
  if let v = contributors(meta.authors) { dict["author"] = v }
  if let v = contributors(meta.translators) { dict["translator"] = v }
  if let v = contributors(meta.editors) { dict["editor"] = v }
  if let v = contributors(meta.artists) { dict["artist"] = v }
  if let v = contributors(meta.illustrators) { dict["illustrator"] = v }
  if let v = contributors(meta.letterers) { dict["letterer"] = v }
  if let v = contributors(meta.pencilers) { dict["penciler"] = v }
  if let v = contributors(meta.colorists) { dict["colorist"] = v }
  if let v = contributors(meta.inkers) { dict["inker"] = v }
  if let v = contributors(meta.narrators) { dict["narrator"] = v }
  if let v = contributors(meta.contributors) { dict["contributor"] = v }
  if let v = contributors(meta.publishers) { dict["publisher"] = v }
  if let v = contributors(meta.imprints) { dict["imprint"] = v }
  if let v = subjects(meta.subjects) { dict["subject"] = v }
  if let description = meta.description { dict["description"] = description }
  if let duration = meta.duration { dict["duration"] = duration }
  if let numberOfPages = meta.numberOfPages { dict["numberOfPages"] = numberOfPages }
  return dict
}

func decorationToDict(_ dec: RDecoration, group: String) -> [String: Any] {
  let locator = locatorToDict(dec.locator)

  var styleType = "highlight"
  var tint: String?
  var isActive: Bool?
  if let highlightConfig = dec.style.config as? RDecoration.Style.HighlightConfig {
    styleType = "highlight"
    tint = highlightConfig.tint.map { $0.cssHex }
    isActive = highlightConfig.isActive
  }

  var style: [String: Any] = ["type": styleType]
  if let tint { style["tint"] = tint }
  if let isActive { style["isActive"] = isActive }

  var dict: [String: Any] = [
    "id": dec.id,
    "locator": locator,
    "style": style,
  ]

  if !dec.userInfo.isEmpty {
    var extras: [String: String] = [:]
    for (key, value) in dec.userInfo {
      if let k = key as? String {
        extras[k] = "\(value)"
      }
    }
    if !extras.isEmpty {
      dict["extras"] = extras
    }
  }

  return dict
}
