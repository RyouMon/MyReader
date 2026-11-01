package com.myreader.readium.reader

import android.graphics.Color
import com.myreader.readium.Converters.decorationRecordToReadium
import com.myreader.readium.Converters.readiumDecorationToMap
import com.myreader.readium.Types.DecorationRecord
import com.myreader.readium.Types.DecorationStyleRecord
import com.myreader.readium.Types.LocatorRecord
import com.myreader.readium.Types.LocatorTextRecord
import org.jsoup.Jsoup
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ReaderNarrationDecorationTest {
  @Test
  fun narration_marks_preserve_identity_color_and_anchor_across_the_bridge() {
    val record = record("椎名真昼")
    val decoration = requireNotNull(decorationRecordToReadium(record))

    assertEquals(Color.parseColor("#C4622D"), (decoration.style as ReaderNarrationDecorationStyle).tint)
    val exported = readiumDecorationToMap(decoration)
    assertEquals(record.id, exported["id"])
    assertEquals(record.extras, exported["extras"])
    assertEquals(mapOf("type" to "myreader-narration", "tint" to "#FFC4622D"), exported["style"])
    val locator = exported["locator"] as Map<*, *>
    assertEquals("chapter.xhtml", locator["href"])
    assertEquals("你好。", (locator["text"] as Map<*, *>)["highlight"])
  }

  @Test
  fun character_names_are_rendered_as_text_and_cannot_inject_markup() {
    val name = "<script>alert(\"角色\")</script> & 旁白"
    val decoration = requireNotNull(decorationRecordToReadium(record(name)))
    val template = requireNotNull(readerDecorationTemplates()[ReaderNarrationDecorationStyle::class])
    val document = Jsoup.parseBodyFragment(template.element(decoration))

    assertEquals(name, document.selectFirst("span")?.text())
    assertTrue(document.select("script").isEmpty())
    assertEquals("true", document.selectFirst("div")?.attr("data-myreader-overlay"))
    assertTrue(document.selectFirst("div")!!.attr("style").contains("196, 98, 45"))
  }

  @Test
  fun missing_character_names_do_not_render_null_labels() {
    val decoration = requireNotNull(decorationRecordToReadium(record("").copy(extras = null)))
    val template = requireNotNull(readerDecorationTemplates()[ReaderNarrationDecorationStyle::class])

    assertEquals("", Jsoup.parseBodyFragment(template.element(decoration)).selectFirst("span")?.text())
  }

  private fun record(name: String) = DecorationRecord(
    id = "plan-1",
    locator = LocatorRecord(href = "chapter.xhtml", type = "application/xhtml+xml", text = LocatorTextRecord(highlight = "你好。")),
    style = DecorationStyleRecord(type = "myreader-narration", tint = "#C4622D"),
    extras = mapOf("characterName" to name),
  )
}
