package com.myreader.readium

import android.graphics.Rect
import android.webkit.WebView
import com.myreader.readium.Types.TtsEngineConfigRecord
import com.myreader.readium.reader.BaseReaderFragment
import com.myreader.readium.reader.EpubReaderFragment
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.ViewEvent
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkConstructor
import io.mockk.slot
import io.mockk.unmockkConstructor
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.util.Url
import org.readium.r2.shared.util.mediatype.MediaType
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ReadiumViewNavigationTest {
  private val scheduler = TestCoroutineScheduler()
  private val frames = ArrayDeque<Runnable>()
  private val renderedFrames = ArrayDeque<WebView.VisualStateCallback>()
  private val events = mutableListOf<Map<String, Any?>>()
  private val followsNarration = slot<() -> Boolean>()
  private val epub = mockk<EpubReaderFragment>(relaxed = true)
  private val web = mockk<WebView>(relaxed = true)
  private var scrollX = 0
  private var visible = true
  private lateinit var reader: ReadiumView

  @Before fun setUp() {
    Dispatchers.setMain(StandardTestDispatcher(scheduler))
    mockkConstructor(ViewEvent::class)
    every { anyConstructed<ViewEvent<Map<String, Any?>>>().invoke(any()) } answers {
      events.add(firstArg())
      Unit
    }
    every { web.getGlobalVisibleRect(any()) } answers {
      firstArg<Rect>().set(0, 0, 600, 800)
      visible
    }
    every { web.url } returns "https://reader.test/chapter.xhtml"
    every { web.scrollX } answers { scrollX }
    every { web.scrollY } returns 0
    every { web.postOnAnimation(any()) } answers { frames.addLast(firstArg()) }
    every { web.removeCallbacks(any()) } answers { frames.remove(firstArg()) }
    every { web.postVisualStateCallback(any(), any()) } answers {
      renderedFrames.addLast(secondArg())
    }
    every { epub.view } returns web
    every { epub.startTts(any(), any(), any(), any(), capture(followsNarration), any()) } returns Unit
    val appContext = mockk<AppContext>(relaxed = true)
    every { appContext.hasActiveReactInstance } returns false
    reader = ReadiumView(RuntimeEnvironment.getApplication(), appContext)
    setFragment(epub)
  }

  @After fun tearDown() {
    reader.cleanup()
    scheduler.runCurrent()
    Dispatchers.resetMain()
    unmockkConstructor(ViewEvent::class)
  }

  @Test fun a_late_rendered_page_remains_user_navigation_after_the_old_reset_deadline() {
    startNarration()
    reader.goForward()
    scheduler.runCurrent()

    scheduler.advanceTimeBy(1_500)
    scheduler.runCurrent()
    assertFalse(followsNarration.captured())
    awaitRenderer()
    scrollX = 600
    finishRendering()
    renderFrame()
    renderFrame()

    val event = locationEvent()
    assertEquals("user", event["source"])
    assertEquals("pageTurn", event["navigationKind"])
    assertNotNull(event["navigationId"])
    assertFalse(followsNarration.captured())
    verify(exactly = 1) { epub.goForward() }
  }

  @Test fun an_unchanged_rendered_boundary_restores_narration_follow() {
    startNarration()
    reader.goBackward()
    assertFalse(followsNarration.captured())

    repeat(3) { renderFrame() }

    assertTrue(followsNarration.captured())
    assertNull(locationEvent()["source"])
    verify(exactly = 1) { epub.goBackward() }
  }

  @Test fun a_location_event_cancels_pending_render_work_and_keeps_user_ownership() {
    startNarration()
    reader.goForward()
    scheduler.runCurrent()
    val first = locationEvent()
    scheduler.advanceUntilIdle()

    assertTrue("The completed navigation must release its pending frame", frames.isEmpty())
    val next = locationEvent()
    assertEquals("user", first["source"])
    assertEquals(first["navigationId"], next["navigationId"])
    assertFalse(followsNarration.captured())
  }

  @Test fun a_cancelled_render_callback_cannot_finish_a_newer_navigation() {
    startNarration()
    reader.goForward()
    awaitRenderer()
    val staleRender = renderedFrames.removeFirst()

    reader.goBackward()
    awaitRenderer()
    staleRender.onComplete(0)
    scheduler.runCurrent()
    assertFalse(followsNarration.captured())
    scrollX = 600
    finishRendering()
    renderFrame()
    renderFrame()

    assertEquals("user", locationEvent()["source"])
    assertFalse(followsNarration.captured())
  }

  @Test fun a_missing_viewport_cannot_restore_follow_for_an_unconfirmed_page() {
    startNarration()
    visible = false
    reader.goForward()
    scheduler.advanceUntilIdle()

    assertEquals("user", locationEvent()["source"])
    assertFalse(followsNarration.captured())
  }

  @Test fun stopping_narration_cancels_navigation_waits_and_ignores_late_rendering() {
    startNarration()
    reader.goForward()
    awaitRenderer()
    reader.stopTts()
    finishRendering()
    scheduler.advanceUntilIdle()

    assertNull(locationEvent()["source"])
    assertTrue(followsNarration.captured())
    assertTrue(frames.isEmpty())
  }

  @Test fun a_non_epub_boundary_without_a_location_update_clears_user_navigation() {
    setFragment(mockk<BaseReaderFragment>(relaxed = true))
    reader.goForward()
    scheduler.advanceUntilIdle()

    assertNull(locationEvent()["source"])
  }

  @Test fun a_non_epub_location_update_remains_user_owned_after_settling() {
    setFragment(mockk<BaseReaderFragment>(relaxed = true))
    reader.goBackward()
    scheduler.runCurrent()
    val first = locationEvent()
    scheduler.advanceUntilIdle()

    assertEquals("user", first["source"])
    assertEquals(first["navigationId"], locationEvent()["navigationId"])
  }

  private fun startNarration() {
    reader.startTts("session", TtsEngineConfigRecord(), null, true, false, null)
    assertTrue(followsNarration.captured())
  }

  private fun awaitRenderer() {
    scheduler.runCurrent()
    frames.removeFirst().run()
    scheduler.runCurrent()
  }

  private fun finishRendering() {
    renderedFrames.removeFirst().onComplete(0)
    scheduler.runCurrent()
  }

  private fun renderFrame() {
    awaitRenderer()
    finishRendering()
  }

  // Supply the native Navigator and deliver its location callback without
  // booting Readium or React Native; assert the bridge's public event contract.
  private fun setFragment(fragment: BaseReaderFragment) {
    ReadiumView::class.java.getDeclaredField("fragment")
      .apply { isAccessible = true }.set(reader, fragment)
  }

  private fun locationEvent(): Map<String, Any?> {
    val locator = Locator(Url("chapter.xhtml")!!, MediaType.XHTML)
    ReadiumView::class.java.getDeclaredMethod("dispatchLocation", Locator::class.java)
      .apply { isAccessible = true }.invoke(reader, locator)
    return events.last()
  }
}
