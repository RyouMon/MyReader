package com.myreader.readium.reader

import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.spyk
import io.mockk.verify
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.runner.RunWith
import org.readium.r2.navigator.epub.EpubNavigatorFragment
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Manifest
import org.readium.r2.shared.publication.Metadata
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.util.mediatype.MediaType
import org.readium.r2.shared.util.Url
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ReaderInitialViewportTest {
  private val saved = Locator(
    href = Url("chapter.xhtml")!!,
    mediaType = MediaType.XHTML,
    text = Locator.Text(highlight = "Saved reading passage"),
  )

  private fun reader(anchorVisible: Boolean): EpubReaderFragment {
    val reader = spyk(EpubReaderFragment())
    EpubReaderFragment::class.java.getDeclaredField("model").apply {
      isAccessible = true
      set(reader, ReaderViewModel(Publication(Manifest(metadata = Metadata())), saved))
    }
    reader.navigatorFragment = mockk<EpubNavigatorFragment>()
    every { reader.navigatorFragment.go(saved, false) } returns true
    coEvery { reader.awaitViewportLayoutStable() } returns true
    coEvery { reader.isTtsLocatorVisible(saved) } returns anchorVisible
    EpubReaderFragment::class.java.getDeclaredField("firstPageLoaded").apply {
      isAccessible = true
      set(reader, CompletableDeferred(Unit))
    }
    return reader
  }

  @Test
  fun restores_saved_text_when_initial_layout_left_it_outside_the_viewport() = runTest {
    val reader = reader(anchorVisible = false)

    reader.awaitNavigatorReady()

    verify(exactly = 1) { reader.navigatorFragment.go(saved, false) }
    coVerify(exactly = 2) { reader.awaitViewportLayoutStable() }
  }

  @Test
  fun preserves_a_correct_initial_viewport_without_an_extra_navigation() = runTest {
    val reader = reader(anchorVisible = true)

    reader.awaitNavigatorReady()

    verify(exactly = 0) { reader.navigatorFragment.go(saved, false) }
  }
}
