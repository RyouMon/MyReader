package com.myreader.readium.reader

import android.graphics.Color
import androidx.annotation.ColorInt
import kotlinx.parcelize.Parcelize
import org.readium.r2.navigator.Decoration
import org.readium.r2.navigator.html.HtmlDecorationTemplate
import org.readium.r2.navigator.html.HtmlDecorationTemplates

@Parcelize
internal data class ReaderNoteMarkerDecorationStyle(
  @ColorInt override val tint: Int,
) : Decoration.Style, Decoration.Style.Tinted

@Parcelize
internal data class ReaderNarrationDecorationStyle(@ColorInt override val tint: Int) : Decoration.Style, Decoration.Style.Tinted

internal fun readerDecorationTemplates(): HtmlDecorationTemplates =
  HtmlDecorationTemplates.defaultTemplates().apply {
    set(ReaderNoteMarkerDecorationStyle::class, readerNoteMarkerTemplate())
    set(ReaderNarrationDecorationStyle::class, readerNarrationTemplate())
  }

private fun readerNarrationTemplate(): HtmlDecorationTemplate = HtmlDecorationTemplate(
  layout = HtmlDecorationTemplate.Layout.BOXES,
  width = HtmlDecorationTemplate.Width.WRAP,
  element = { decoration ->
    val tint = (decoration.style as ReaderNarrationDecorationStyle).tint
    val background = Color.argb(50, Color.red(tint), Color.green(tint), Color.blue(tint)).toCssColor()
    val labelBackground = Color.argb(150, Color.red(tint), Color.green(tint), Color.blue(tint)).toCssColor()
    val name = decoration.extras["characterName"]?.toString()?.htmlAttributeEscaped() ?: ""
    "<div data-myreader-overlay=\"true\" class=\"myreader-narration-mark\" style=\"background: $background !important\"><span style=\"background: $labelBackground !important\">$name</span></div>"
  },
  stylesheet = """
    .myreader-narration-mark { height: 100%; pointer-events: none; }
    .myreader-narration-mark > span { position: absolute; top: 0; right: 0; transform: translateY(-75%); padding: 1px 4px; border-radius: 3px; font: 10px/1.2 sans-serif; color: inherit; white-space: nowrap; max-width: 10em; overflow: hidden; text-overflow: ellipsis; }
    .myreader-narration-mark:not(:first-child) > span { display: none; }
  """.trimIndent(),
)

private fun readerNoteMarkerTemplate(): HtmlDecorationTemplate =
  HtmlDecorationTemplate(
    layout = HtmlDecorationTemplate.Layout.BOXES,
    width = HtmlDecorationTemplate.Width.WRAP,
    element = { decoration ->
      val tint = (decoration.style as? ReaderNoteMarkerDecorationStyle)?.tint
        ?: Color.rgb(217, 169, 40)
      val accessibilityLabel =
        decoration.extras["accessibilityLabel"]?.toString()?.htmlAttributeEscaped()
          ?: "Open note"
      ReaderNoteMarkerTemplateSource.ELEMENT
        .replace("{{accessibilityLabel}}", accessibilityLabel)
        .replace("{{tint}}", tint.toCssColor())
    },
    stylesheet =
      ReaderNoteMarkerTemplateSource.STYLESHEET
        .replace("{{hitSize}}", "48")
        .replace("{{hitOffset}}", "24"),
  )

private fun Int.toCssColor(): String =
  "rgba(${Color.red(this)}, ${Color.green(this)}, ${Color.blue(this)}, ${Color.alpha(this) / 255.0})"

private fun String.htmlAttributeEscaped(): String =
  replace("&", "&amp;")
    .replace("\"", "&quot;")
    .replace("<", "&lt;")
    .replace(">", "&gt;")
