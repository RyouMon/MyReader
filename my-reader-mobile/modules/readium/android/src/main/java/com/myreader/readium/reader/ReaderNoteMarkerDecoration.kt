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

internal fun readerDecorationTemplates(): HtmlDecorationTemplates =
  HtmlDecorationTemplates.defaultTemplates().apply {
    set(ReaderNoteMarkerDecorationStyle::class, readerNoteMarkerTemplate())
  }

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
