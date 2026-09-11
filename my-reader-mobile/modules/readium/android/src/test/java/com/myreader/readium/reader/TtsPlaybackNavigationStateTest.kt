package com.myreader.readium.reader

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TtsPlaybackNavigationStateTest {
  @Test
  fun visible_tts_locator_does_not_issue_a_follow_navigation() = runBlocking {
    var navigationCount = 0

    val moved = navigateToTtsLocatorIfNeeded(
      isVisible = { true },
      navigate = {
        navigationCount += 1
        true
      },
    )

    assertTrue(moved)
    assertEquals(0, navigationCount)
  }

  @Test
  fun offscreen_tts_locator_still_issues_a_follow_navigation() = runBlocking {
    var navigationCount = 0

    val moved = navigateToTtsLocatorIfNeeded(
      isVisible = { false },
      navigate = {
        navigationCount += 1
        true
      },
    )

    assertTrue(moved)
    assertEquals(1, navigationCount)
  }

  @Test
  fun tts_follow_scrolls_without_locking_navigation_inside_the_current_resource() {
    assertTrue(ttsFollowStaysInCurrentResource("chapter.xhtml", "chapter.xhtml"))
    assertFalse(ttsFollowStaysInCurrentResource("chapter.xhtml", "chapter-2.xhtml"))
    assertFalse(ttsFollowStaysInCurrentResource(null, "chapter.xhtml"))
  }

  @Test
  fun delayed_follow_text_locations_remain_owned_by_tts() {
    val state = TtsPlaybackNavigationState()

    state.beginTtsFollow()
    state.endTtsFollow()

    assertEquals("tts", state.locationEvent().source)
    assertEquals("tts", state.locationEvent().source)
    assertTrue(state.allowsTtsFollow)
  }

  @Test
  fun consecutive_utterances_keep_automatic_page_follow_enabled() {
    val state = TtsPlaybackNavigationState()

    state.beginTtsFollow()
    val firstSentence = state.locationEvent()
    state.endTtsFollow()
    state.beginTtsFollow()
    val nextPageSentence = state.locationEvent()

    assertEquals("tts", firstSentence.source)
    assertEquals("tts", nextPageSentence.source)
    assertTrue(state.allowsTtsFollow)
  }

  @Test
  fun user_navigation_rejects_old_tts_follow_callbacks() {
    val state = TtsPlaybackNavigationState()
    state.beginTtsFollow()

    val navigationId = state.beginUserNavigation()
    state.beginTtsFollow()
    val event = state.locationEvent()

    assertEquals("user", event.source)
    assertEquals(navigationId, event.navigationId)
    assertEquals("pageTurn", event.navigationKind)
    assertFalse(state.allowsTtsFollow)
    assertFalse(state.cancelUserNavigationIfUnchanged(navigationId))
  }

  @Test
  fun returning_to_the_narrated_page_restores_tts_navigation() {
    val state = TtsPlaybackNavigationState()
    state.beginTtsFollow()
    val navigationId = state.beginUserNavigation()
    state.locationEvent()

    assertFalse(state.allowsTtsFollow)
    assertTrue(state.reattachViewport(navigationId))
    assertTrue(state.allowsTtsFollow)
    assertEquals("tts", state.locationEvent().source)
  }

  @Test
  fun explicit_return_to_playback_position_is_owned_by_tts() {
    val state = TtsPlaybackNavigationState()
    state.beginTtsFollow()
    val navigationId = state.beginUserNavigation()
    state.locationEvent()

    assertTrue(state.returnToPlaybackPosition(navigationId))
    assertTrue(state.isReturningToPlaybackPosition)
    assertTrue(state.allowsTtsFollow)
    assertEquals("tts", state.locationEvent().source)
    state.completeReturnToPlaybackPosition(navigationId, succeeded = true)
    assertFalse(state.isReturningToPlaybackPosition)
    assertFalse(state.returnToPlaybackPosition(navigationId))
  }

  @Test
  fun failed_explicit_return_restores_the_detached_viewport() {
    val state = TtsPlaybackNavigationState()
    state.beginTtsFollow()
    val navigationId = state.beginUserNavigation()
    state.locationEvent()

    assertTrue(state.returnToPlaybackPosition(navigationId))
    state.completeReturnToPlaybackPosition(navigationId, succeeded = false)

    assertFalse(state.isReturningToPlaybackPosition)
    assertFalse(state.allowsTtsFollow)
    assertTrue(state.returnToPlaybackPosition(navigationId))
  }

  @Test
  fun manual_navigation_cancels_an_explicit_return_in_progress() {
    val state = TtsPlaybackNavigationState()
    state.beginTtsFollow()
    val returnNavigationId = state.beginUserNavigation()
    state.locationEvent()
    assertTrue(state.returnToPlaybackPosition(returnNavigationId))

    val currentNavigationId = state.beginUserNavigation()
    state.completeReturnToPlaybackPosition(
      returnNavigationId,
      succeeded = true,
    )

    assertFalse(state.isReturningToPlaybackPosition)
    assertFalse(state.allowsTtsFollow)
    assertEquals(currentNavigationId, state.locationEvent().navigationId)
  }

  @Test
  fun stale_visibility_result_cannot_reattach_a_newer_viewport() {
    val state = TtsPlaybackNavigationState()
    state.beginTtsFollow()
    val oldNavigationId = state.beginUserNavigation()
    state.locationEvent()
    val currentNavigationId = state.beginUserNavigation()
    state.locationEvent()
    state.detachViewportForSession(oldNavigationId)

    assertFalse(state.reattachViewport(oldNavigationId))
    assertFalse(state.allowsTtsFollow)
    assertTrue(state.reattachViewport(currentNavigationId))
    assertTrue(state.allowsTtsFollow)
  }

  @Test
  fun programmatic_navigation_is_distinguished_from_a_page_turn() {
    val state = TtsPlaybackNavigationState()

    val navigationId = state.beginUserNavigation(detachViewport = false)
    val event = state.locationEvent()

    assertEquals("user", event.source)
    assertEquals(navigationId, event.navigationId)
    assertEquals("programmatic", event.navigationKind)
  }

  @Test
  fun an_unchanged_boundary_navigation_restores_the_previous_tts_owner() {
    val state = TtsPlaybackNavigationState()
    state.beginTtsFollow()

    val navigationId = state.beginUserNavigation()

    assertTrue(state.cancelUserNavigationIfUnchanged(navigationId))
    assertEquals("tts", state.locationEvent().source)
  }

  @Test
  fun a_new_session_clears_every_navigation_owner() {
    val state = TtsPlaybackNavigationState()
    state.beginTtsFollow()
    state.beginUserNavigation()

    state.resetForSession()
    val event = state.locationEvent()

    assertNull(event.source)
    assertNull(event.navigationId)
    assertNull(event.navigationKind)
    assertTrue(state.allowsTtsFollow)
  }

  @Test
  fun setup_can_preserve_a_viewport_detached_before_native_playback_starts() {
    val state = TtsPlaybackNavigationState()

    state.detachViewportForSession("navigation-during-setup")

    assertFalse(state.allowsTtsFollow)
    assertFalse(state.reattachViewport("stale-navigation"))
    assertTrue(state.reattachViewport("navigation-during-setup"))
    state.resetForSession()
    assertTrue(state.allowsTtsFollow)
  }
}
