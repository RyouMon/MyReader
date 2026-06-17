package com.myreader.readium.Converters

import android.graphics.Color
import com.myreader.readium.Types.DecorationRecord
import com.myreader.readium.Types.LocatorRecord
import com.myreader.readium.Types.PreferencesRecord
import com.myreader.readium.utils.normalizeHref
import org.readium.adapter.pdfium.navigator.PdfiumPreferences as ReadiumPdfPreferences
import org.readium.r2.navigator.Decoration as ReadiumDecoration
import org.readium.r2.navigator.epub.EpubPreferences as ReadiumEpubPreferences
import org.readium.r2.navigator.preferences.Axis
import org.readium.r2.navigator.preferences.ColumnCount
import org.readium.r2.navigator.preferences.Color as ReadiumColor
import org.readium.r2.navigator.preferences.Fit
import org.readium.r2.navigator.preferences.FontFamily
import org.readium.r2.navigator.preferences.ImageFilter
import org.readium.r2.navigator.preferences.ReadingProgression as NavReadingProgression
import org.readium.r2.navigator.preferences.Spread as NavSpread
import org.readium.r2.navigator.preferences.TextAlign
import org.readium.r2.navigator.preferences.Theme
import org.readium.r2.shared.publication.Contributor
import org.readium.r2.shared.publication.Link as ReadiumLink
import org.readium.r2.shared.publication.Locator as ReadiumLocator
import org.readium.r2.shared.publication.Metadata as ReadiumMetadata
import org.readium.r2.shared.publication.Subject
import org.readium.r2.shared.util.Language
import org.readium.r2.shared.util.Url as ReadiumUrl
import org.readium.r2.shared.util.mediatype.MediaType as ReadiumMediaType

// Sepia theme colors — unified across iOS, Android, and web
private const val SEPIA_BACKGROUND = "#f4ecd8"
private const val SEPIA_TEXT = "#5f4b32"

// MARK: - Record → Readium

internal fun preferencesRecordToEpub(prefs: PreferencesRecord): ReadiumEpubPreferences {
  // When theme is sepia and no explicit colors are set, inject our unified
  // sepia colors so the result matches iOS and web exactly.
  val bgColor = prefs.backgroundColor?.let { parseReadiumColor(it) }
    ?: if (prefs.theme == "sepia" && prefs.backgroundColor == null) parseReadiumColor(SEPIA_BACKGROUND) else null
  val txtColor = prefs.textColor?.let { parseReadiumColor(it) }
    ?: if (prefs.theme == "sepia" && prefs.textColor == null) parseReadiumColor(SEPIA_TEXT) else null

  return ReadiumEpubPreferences(
    backgroundColor = bgColor,
    columnCount = prefs.columnCount?.let { parseColumnCount(it) },
    fontFamily = prefs.fontFamily?.let { FontFamily(it) },
    fontSize = prefs.fontSize,
    fontWeight = prefs.fontWeight,
    hyphens = prefs.hyphens,
    imageFilter = prefs.imageFilter?.let { parseImageFilter(it) },
    language = prefs.language?.let { Language(it) },
    letterSpacing = prefs.letterSpacing,
    ligatures = prefs.ligatures,
    lineHeight = prefs.lineHeight,
    pageMargins = prefs.pageMargins,
    paragraphIndent = prefs.paragraphIndent,
    paragraphSpacing = prefs.paragraphSpacing,
    publisherStyles = prefs.publisherStyles,
    readingProgression = prefs.readingProgression?.let { parseReadingProgression(it) },
    scroll = prefs.scroll,
    spread = prefs.spread?.let { parseSpread(it) },
    textAlign = prefs.textAlign?.let { parseTextAlign(it) },
    textColor = txtColor,
    textNormalization = prefs.textNormalization,
    theme = prefs.theme?.let { parseTheme(it) },
    typeScale = prefs.typeScale,
    verticalText = prefs.verticalText,
    wordSpacing = prefs.wordSpacing,
  )
}

internal fun preferencesRecordToPdf(prefs: PreferencesRecord): ReadiumPdfPreferences {
  return ReadiumPdfPreferences(
    fit = Fit.WIDTH,
    pageSpacing = null,
    readingProgression = prefs.readingProgression?.let { parseReadingProgression(it) },
    scrollAxis = if (prefs.scroll == true) Axis.VERTICAL else Axis.HORIZONTAL
  )
}

internal fun locatorRecordToReadium(loc: LocatorRecord): ReadiumLocator? {
  val normalized = normalizeHref(loc.href)
  val href = ReadiumUrl(normalized.resourcePath) ?: return null
  val mediaType = ReadiumMediaType(loc.type) ?: ReadiumMediaType.BINARY

  // Merge any fragment from the href into locations.fragments
  val fragments = buildList {
    normalized.fragment?.let { add(it) }
  }

  return ReadiumLocator(
    href = href,
    mediaType = mediaType,
    title = loc.title,
    locations = ReadiumLocator.Locations(
      fragments = fragments,
      progression = loc.locations?.progression,
      position = loc.locations?.position?.toInt(),
      totalProgression = loc.locations?.totalProgression
    ),
    text = ReadiumLocator.Text(
      before = loc.text?.before,
      highlight = loc.text?.highlight,
      after = loc.text?.after
    )
  )
}

internal fun decorationRecordToReadium(dec: DecorationRecord): ReadiumDecoration? {
  val locator = locatorRecordToReadium(dec.locator ?: return null) ?: return null
  val styleRec = dec.style ?: return null

  val style: ReadiumDecoration.Style = when (styleRec.type) {
    "highlight" -> ReadiumDecoration.Style.Highlight(
      tint = parseColorString(styleRec.tint),
      isActive = styleRec.isActive ?: false
    )
    "underline" -> ReadiumDecoration.Style.Underline(
      tint = parseColorString(styleRec.tint),
      isActive = styleRec.isActive ?: false
    )
    else -> return null
  }

  val extras: Map<String, Any> = dec.extras ?: emptyMap()

  return ReadiumDecoration(
    id = dec.id,
    locator = locator,
    style = style,
    extras = extras
  )
}

private fun parseReadiumColor(hex: String): ReadiumColor? {
  return try {
    ReadiumColor(android.graphics.Color.parseColor(hex))
  } catch (e: Exception) {
    null
  }
}

private fun parseTheme(value: String): Theme? = when (value) {
  "light" -> Theme.LIGHT
  "dark" -> Theme.DARK
  "sepia" -> Theme.SEPIA
  else -> null
}

private fun parseColumnCount(value: String): ColumnCount? = when (value) {
  "auto" -> ColumnCount.AUTO
  "1" -> ColumnCount.ONE
  "2" -> ColumnCount.TWO
  else -> null
}

private fun parseImageFilter(value: String): ImageFilter? = when (value) {
  "darken" -> ImageFilter.DARKEN
  "invert" -> ImageFilter.INVERT
  else -> null
}

private fun parseReadingProgression(value: String): NavReadingProgression? = when (value) {
  "ltr" -> NavReadingProgression.LTR
  "rtl" -> NavReadingProgression.RTL
  else -> null
}

private fun parseSpread(value: String): NavSpread? = when (value) {
  "auto" -> NavSpread.AUTO
  "never" -> NavSpread.NEVER
  "always" -> NavSpread.ALWAYS
  else -> null
}

private fun parseTextAlign(value: String): TextAlign? = when (value) {
  "center" -> TextAlign.CENTER
  "justify" -> TextAlign.JUSTIFY
  "start" -> TextAlign.START
  "end" -> TextAlign.END
  "left" -> TextAlign.LEFT
  "right" -> TextAlign.RIGHT
  else -> null
}

internal fun parseColorString(colorString: String?): Int {
  if (colorString == null) return Color.YELLOW
  val trimmed = colorString.trim()
  return try {
    when {
      trimmed.startsWith("rgb(") -> {
        val values = trimmed.substringAfter("(").substringBefore(")").split(",")
        Color.rgb(values[0].trim().toInt(), values[1].trim().toInt(), values[2].trim().toInt())
      }
      trimmed.startsWith("rgba(") -> {
        val values = trimmed.substringAfter("(").substringBefore(")").split(",")
        Color.argb((values[3].trim().toFloat() * 255).toInt(),
          values[0].trim().toInt(), values[1].trim().toInt(), values[2].trim().toInt())
      }
      else -> Color.parseColor(trimmed) // handles hex + named colors
    }
  } catch (e: Exception) {
    Color.YELLOW
  }
}

// MARK: - Readium → JS Map

internal fun readiumLocatorToMap(loc: ReadiumLocator): Map<String, Any?> {
  val locations = mutableMapOf<String, Any?>("progression" to (loc.locations.progression ?: 0.0))
  loc.locations.position?.let { locations["position"] = it }
  loc.locations.totalProgression?.let { locations["totalProgression"] = it }

  val dict = mutableMapOf<String, Any?>(
    "href" to loc.href.toString(),
    "type" to loc.mediaType.toString(),
    "locations" to locations,
  )
  loc.title?.let { dict["title"] = it }

  val text = mutableMapOf<String, Any?>()
  loc.text.before?.let { text["before"] = it }
  loc.text.highlight?.let { text["highlight"] = it }
  loc.text.after?.let { text["after"] = it }
  if (text.isNotEmpty()) dict["text"] = text

  return dict
}

internal fun readiumLinkToMap(
  link: ReadiumLink,
  depth: Double = 0.0,
  parentHref: String? = null,
  position: Double = 0.0
): Map<String, Any?> {
  val dict = mutableMapOf<String, Any?>(
    "href" to link.href.toString(),
    "depth" to depth,
    "position" to position,
  )
  link.title?.let { dict["title"] = it }
  val rels = link.rels.map { it.toString() }
  if (rels.isNotEmpty()) dict["rels"] = rels
  if (link.languages.isNotEmpty()) dict["languages"] = link.languages
  if (link.children.isNotEmpty()) dict["hasChildren"] = true
  parentHref?.let { dict["parentHref"] = it }
  return dict
}

internal fun flattenReadiumLinksToMaps(
  links: List<ReadiumLink>,
  depth: Double = 0.0,
  parentHref: String? = null
): List<Map<String, Any?>> {
  val result = mutableListOf<Map<String, Any?>>()
  for ((index, link) in links.withIndex()) {
    result.add(readiumLinkToMap(link, depth, parentHref, index.toDouble()))
    if (link.children.isNotEmpty()) {
      result.addAll(flattenReadiumLinksToMaps(link.children, depth + 1, link.href.toString()))
    }
  }
  return result
}

internal fun readiumMetadataToMap(meta: ReadiumMetadata): Map<String, Any?> {
  fun contributors(list: List<Contributor>): List<Map<String, Any?>>? {
    if (list.isEmpty()) return null
    return list.map { c ->
      val d = mutableMapOf<String, Any?>("name" to c.name)
      c.sortAs?.let { d["sortAs"] = it }
      c.identifier?.let { d["identifier"] = it }
      c.roles.firstOrNull()?.let { d["role"] = it }
      c.position?.let { d["position"] = it }
      d
    }
  }

  fun subjects(list: List<Subject>): List<Map<String, Any?>>? {
    if (list.isEmpty()) return null
    return list.map { s ->
      val d = mutableMapOf<String, Any?>("name" to s.name)
      s.sortAs?.let { d["sortAs"] = it }
      s.code?.let { d["code"] = it }
      s.scheme?.let { d["scheme"] = it }
      d
    }
  }

  val dict = mutableMapOf<String, Any?>(
    "title" to (meta.title ?: "Untitled"),
    "readingProgression" to (meta.readingProgression?.value ?: "ltr")
  )
  meta.sortAs?.let { dict["sortAs"] = it }
  meta.localizedSubtitle?.string?.let { dict["subtitle"] = it }
  meta.identifier?.let { dict["identifier"] = it }
  meta.modified?.let { dict["modified"] = it.toString() }
  meta.published?.let { dict["published"] = it.toString() }
  if (meta.languages.isNotEmpty()) dict["language"] = meta.languages
  contributors(meta.authors)?.let { dict["author"] = it }
  contributors(meta.translators)?.let { dict["translator"] = it }
  contributors(meta.editors)?.let { dict["editor"] = it }
  contributors(meta.artists)?.let { dict["artist"] = it }
  contributors(meta.illustrators)?.let { dict["illustrator"] = it }
  contributors(meta.letterers)?.let { dict["letterer"] = it }
  contributors(meta.pencilers)?.let { dict["penciler"] = it }
  contributors(meta.colorists)?.let { dict["colorist"] = it }
  contributors(meta.inkers)?.let { dict["inker"] = it }
  contributors(meta.narrators)?.let { dict["narrator"] = it }
  contributors(meta.contributors)?.let { dict["contributor"] = it }
  contributors(meta.publishers)?.let { dict["publisher"] = it }
  contributors(meta.imprints)?.let { dict["imprint"] = it }
  subjects(meta.subjects)?.let { dict["subject"] = it }
  meta.description?.let { dict["description"] = it }
  meta.duration?.let { dict["duration"] = it }
  meta.numberOfPages?.let { dict["numberOfPages"] = it }
  return dict
}

internal fun readiumDecorationToMap(dec: ReadiumDecoration): Map<String, Any?> {
  val locator = readiumLocatorToMap(dec.locator)

  var styleType = "highlight"
  var tint: String? = null
  var isActive: Boolean? = null
  // Bind to a local so the `is` branches smart-cast; `dec.style` is a public
  // property declared in a different module (the readium aar), so it can't be
  // smart-cast directly.
  val decStyle = dec.style
  when (decStyle) {
    is ReadiumDecoration.Style.Highlight -> {
      styleType = "highlight"
      tint = colorToHex(decStyle.tint)
      isActive = decStyle.isActive
    }
    is ReadiumDecoration.Style.Underline -> {
      styleType = "underline"
      tint = colorToHex(decStyle.tint)
      isActive = decStyle.isActive
    }
    else -> {}
  }

  val style = mutableMapOf<String, Any?>("type" to styleType)
  tint?.let { style["tint"] = it }
  isActive?.let { style["isActive"] = it }

  val dict = mutableMapOf<String, Any?>(
    "id" to dec.id,
    "locator" to locator,
    "style" to style,
  )

  if (dec.extras.isNotEmpty()) {
    dict["extras"] = dec.extras.entries.associate { it.key to it.value.toString() }
  }
  return dict
}

internal fun colorToHex(color: Int): String = String.format("#%08X", color)
