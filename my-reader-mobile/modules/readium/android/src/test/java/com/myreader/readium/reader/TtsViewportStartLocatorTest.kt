package com.myreader.readium.reader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.util.Url
import org.readium.r2.shared.util.mediatype.MediaType
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class TtsViewportStartLocatorTest {
  @Test
  fun playback_quote_escapes_numeric_ids_and_discards_stale_page_ranges() {
    val locator = Locator(
      href = requireNotNull(Url("chapter.xhtml")),
      mediaType = MediaType.XHTML,
      locations = Locator.Locations(
        progression = 0.4,
        position = 33,
        otherLocations = mapOf(
          "cssSelector" to "#8IL20-book > div > p:nth-child(3)",
          "domRange" to mapOf("start" to mapOf("cssSelector" to "p", "charOffset" to 0)),
        ),
      ),
      text = Locator.Text(before = "在上面专业", highlight = "剧本", after = "故事线"),
    )
    val playback = ttsPlaybackTextLocator(locator)
    assertEquals("#\\38 IL20-book > div > p:nth-child(3)", playback.locations.otherLocations["cssSelector"])
    assertNull(playback.locations.otherLocations["domRange"])
    assertNull(playback.locations.progression)
    assertEquals(33, playback.locations.position)
    assertEquals(locator.text, playback.text)
    assertEquals(playback, ttsPlaybackTextLocator(playback))
  }

  @Test
  fun viewport_text_anchor_overrides_a_stale_end_progression() {
    val current = Locator(
      href = requireNotNull(Url("chapter.xhtml")),
      mediaType = MediaType.XHTML,
      locations = Locator.Locations(
        progression = 1.0,
        totalProgression = 0.8,
        position = 12,
      ),
    )
    val domRange = mapOf(
      "start" to mapOf(
        "cssSelector" to "h2",
        "textNodeIndex" to 0,
        "charOffset" to 0,
      ),
    )

    val anchored = ttsViewportStartLocator(
      current = current,
      cssSelector = "h2",
      domRange = domRange,
      text = Locator.Text(highlight = "Final page heading"),
    )

    assertNull(anchored.locations.progression)
    assertEquals(0.8, anchored.locations.totalProgression)
    assertEquals(12, anchored.locations.position)
    assertEquals("h2", anchored.locations.otherLocations["cssSelector"])
    assertEquals(domRange, anchored.locations.otherLocations["domRange"])
    assertEquals("Final page heading", anchored.text.highlight)
  }
}
