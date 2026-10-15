package com.myreader.readium.reader

import com.myreader.readium.utils.LinkOrLocator
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.readium.r2.shared.publication.Link
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Manifest
import org.readium.r2.shared.publication.Metadata
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.services.PerResourcePositionsService
import org.readium.r2.shared.publication.services.positionsServiceFactory
import org.readium.r2.shared.publication.services.positions
import org.readium.r2.shared.util.Url
import org.readium.r2.shared.util.mediatype.MediaType
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ReaderStartLocationTest {
  private val service = ReaderService(RuntimeEnvironment.getApplication())
  private val publication = Publication(
    manifest = Manifest(
      metadata = Metadata(),
      readingOrder = listOf("OEBPS/chapter1.xhtml", "OEBPS/chapter2.xhtml").map {
        Link(href = requireNotNull(Url(it)), mediaType = MediaType.XHTML)
      },
    ),
    servicesBuilder = Publication.ServicesBuilder().apply {
      positionsServiceFactory = PerResourcePositionsService.createFactory(MediaType.XHTML)
    },
  )

  @Test
  fun restores_foreign_resource_paths_before_creating_the_navigator() = runBlocking {
    val saved = Locator(
      href = requireNotNull(Url("chapter2.xhtml")),
      mediaType = MediaType.XHTML,
      locations = Locator.Locations(
        position = 99,
        progression = 0.4,
        totalProgression = 0.7,
        fragments = listOf("paragraph-2"),
        otherLocations = mapOf("cssSelector" to "#paragraph-2"),
      ),
      text = Locator.Text(highlight = "Saved paragraph"),
    )

    val restored = service.locatorFromLinkOrLocator(LinkOrLocator.Locator(saved), publication)

    assertEquals(saved.copy(
      href = requireNotNull(Url("OEBPS/chapter2.xhtml")),
      locations = saved.locations.copy(position = 2),
    ), restored)
  }

  @Test
  fun falls_back_to_a_native_position_when_the_saved_resource_is_unknown() = runBlocking {
    val saved = Locator(
      href = requireNotNull(Url("desktop/chapter.xhtml")),
      mediaType = MediaType.XHTML,
      locations = Locator.Locations(position = 2, fragments = listOf("foreign-anchor")),
      text = Locator.Text(highlight = "Foreign text"),
    )

    val restored = service.locatorFromLinkOrLocator(LinkOrLocator.Locator(saved), publication)

    assertEquals(publication.positions()[1], restored)
  }

  @Test
  fun restores_progression_when_the_foreign_position_is_out_of_range() = runBlocking {
    val saved = Locator(
      href = requireNotNull(Url("desktop/chapter.xhtml")),
      mediaType = MediaType.XHTML,
      locations = Locator.Locations(position = 99, totalProgression = 0.8),
    )

    val restored = service.locatorFromLinkOrLocator(LinkOrLocator.Locator(saved), publication)

    assertEquals(publication.positions()[1], restored)
  }
}
