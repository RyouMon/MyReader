import Testing
import ReadiumShared
@testable import Readium

@Test
func tts_follow_scrolls_without_locking_navigation_inside_the_current_resource() {
  #expect(ttsFollowStaysInCurrentResource(
    currentHref: "chapter.xhtml",
    targetHref: "chapter.xhtml"
  ))
  #expect(!ttsFollowStaysInCurrentResource(
    currentHref: "chapter.xhtml",
    targetHref: "chapter-2.xhtml"
  ))
  #expect(!ttsFollowStaysInCurrentResource(
    currentHref: nil,
    targetHref: "chapter.xhtml"
  ))
}

@Test
func locator_visibility_uses_the_readium_viewport_progression() {
  let viewport = ["chapter.xhtml": 0.45 ... 0.65]

  #expect(ttsProgressionIsVisible(
    targetHref: "chapter.xhtml",
    targetProgression: 0.2,
    visibleProgressions: viewport
  ) == false)
  #expect(ttsProgressionIsVisible(
    targetHref: "chapter.xhtml",
    targetProgression: 0.5,
    visibleProgressions: viewport
  ) == true)
  #expect(ttsProgressionIsVisible(
    targetHref: "next.xhtml",
    targetProgression: 0.5,
    visibleProgressions: viewport
  ) == false)
  #expect(ttsProgressionIsVisible(
    targetHref: "chapter.xhtml",
    targetProgression: nil,
    visibleProgressions: viewport
  ) == nil)
}

@Test
func precise_dom_visibility_overrides_approximate_progression() {
  #expect(ttsLocatorIsVisible(
    progressionVisibility: false,
    domRangeVisibility: true
  ))
  #expect(!ttsLocatorIsVisible(
    progressionVisibility: true,
    domRangeVisibility: false
  ))
  #expect(!ttsLocatorIsVisible(
    progressionVisibility: false,
    domRangeVisibility: false
  ))
}

@Test
func visible_tts_locator_does_not_issue_a_follow_navigation() async {
  var navigationCount = 0

  let moved = await navigateToTtsLocatorIfNeeded(
    isVisible: { true },
    navigate: {
      navigationCount += 1
      return true
    }
  )

  #expect(moved)
  #expect(navigationCount == 0)
}

@Test
func offscreen_tts_locator_still_issues_a_follow_navigation() async {
  var navigationCount = 0

  let moved = await navigateToTtsLocatorIfNeeded(
    isVisible: { false },
    navigate: {
      navigationCount += 1
      return true
    }
  )

  #expect(moved)
  #expect(navigationCount == 1)
}

@Test
func viewport_start_prefers_the_visible_resource_over_a_stale_locator() {
  #expect(ttsViewportStartHref(
    currentHref: "progress.xhtml",
    fallbackHref: "progress.xhtml",
    visibleHrefs: ["lifecycle.xhtml"]
  ) == "lifecycle.xhtml")
}

@Test
func viewport_text_anchor_overrides_a_stale_end_progression() {
  let current = Locator(
    href: AnyURL(path: "chapter.xhtml")!,
    mediaType: .xhtml,
    locations: .init(
      progression: 1,
      totalProgression: 0.8,
      position: 12
    )
  )
  let domRange: JSONValue = [
    "start": [
      "cssSelector": "h2",
      "textNodeIndex": 0,
      "charOffset": 0,
    ],
  ]

  let anchored = ttsViewportStartLocator(
    current: current,
    cssSelector: "h2",
    domRange: domRange,
    text: .init(highlight: "Final page heading")
  )

  #expect(anchored.locations.progression == nil)
  #expect(anchored.locations.totalProgression == 0.8)
  #expect(anchored.locations.position == 12)
  #expect(anchored.locations.cssSelector == "h2")
  #expect(anchored.locations.otherLocations["domRange"] == domRange)
  #expect(anchored.text.highlight == "Final page heading")
}

@Test
func sentence_navigation_preserves_a_paused_playback_intent() {
  var state = TtsSentenceNavigationPlaybackState()

  state.didPause()
  state.beginSentenceNavigation()

  let firstPlayingStateShouldPause = state.didStartPlaying()
  let repeatedPlayingStateShouldPause = state.didStartPlaying()
  #expect(firstPlayingStateShouldPause)
  #expect(repeatedPlayingStateShouldPause)
  state.didPause()
  #expect(state.isPaused)
}

@Test
func sentence_navigation_keeps_an_active_playback_intent() {
  var state = TtsSentenceNavigationPlaybackState()

  let startedPlaying = state.didStartPlaying()
  state.beginSentenceNavigation()

  let navigatedWhilePlaying = state.didStartPlaying()
  #expect(!startedPlaying)
  #expect(!navigatedWhilePlaying)
  #expect(!state.isPaused)
}

@Test
func resuming_and_stopping_clear_a_preserved_pause_intent() {
  var state = TtsSentenceNavigationPlaybackState()

  state.didPause()
  let resumed = state.didStartPlaying()
  #expect(!resumed)
  #expect(!state.isPaused)

  state.didPause()
  state.beginSentenceNavigation()
  state.didStop()
  let restarted = state.didStartPlaying()
  #expect(!restarted)
  #expect(!state.isPaused)
}

@Test
func delayed_follow_text_locations_remain_owned_by_tts() {
  let state = TtsPlaybackNavigationState()

  state.beginTtsFollow()
  state.endTtsFollow()

  #expect(state.locationEvent().source == "tts")
  #expect(state.locationEvent().source == "tts")
  #expect(state.allowsTtsFollow)
}

@Test
func consecutive_utterances_keep_automatic_page_follow_enabled() {
  let state = TtsPlaybackNavigationState()

  state.beginTtsFollow()
  let firstSentence = state.locationEvent()
  state.endTtsFollow()
  state.beginTtsFollow()
  let nextPageSentence = state.locationEvent()

  #expect(firstSentence.source == "tts")
  #expect(nextPageSentence.source == "tts")
  #expect(state.allowsTtsFollow)
}

@Test
func user_navigation_rejects_old_tts_follow_callbacks() {
  let state = TtsPlaybackNavigationState()
  state.beginTtsFollow()

  let navigationId = state.beginUserNavigation()
  state.beginTtsFollow()
  let event = state.locationEvent()

  #expect(event.source == "user")
  #expect(event.navigationId == navigationId)
  #expect(event.navigationKind == "pageTurn")
  #expect(!state.allowsTtsFollow)
  #expect(!state.cancelUserNavigationIfUnchanged(navigationId))
}

@Test
func viewport_change_keeps_slow_user_navigation_owned_by_the_user() {
  let state = TtsPlaybackNavigationState()
  state.beginTtsFollow()

  let navigationId = state.beginUserNavigation()
  state.viewportDidChange()

  #expect(!state.cancelUserNavigationIfUnchanged(navigationId))
  let event = state.locationEvent()
  #expect(event.source == "user")
  #expect(event.navigationId == navigationId)
  #expect(!state.allowsTtsFollow)
}

@Test
func returning_to_the_narrated_page_restores_tts_navigation() {
  let state = TtsPlaybackNavigationState()
  state.beginTtsFollow()
  let navigationId = state.beginUserNavigation()
  _ = state.locationEvent()

  #expect(!state.allowsTtsFollow)
  #expect(state.reattachViewport(navigationId: navigationId))
  #expect(state.allowsTtsFollow)
  #expect(state.locationEvent().source == "tts")
}

@Test
func explicit_return_to_playback_position_is_owned_by_tts() {
  let state = TtsPlaybackNavigationState()
  state.beginTtsFollow()
  let navigationId = state.beginUserNavigation()
  _ = state.locationEvent()

  #expect(state.returnToPlaybackPosition(navigationId: navigationId))
  #expect(state.isReturningToPlaybackPosition)
  #expect(state.allowsTtsFollow)
  #expect(state.locationEvent().source == "tts")
  state.completeReturnToPlaybackPosition(
    navigationId: navigationId,
    succeeded: true
  )
  #expect(!state.isReturningToPlaybackPosition)
  #expect(!state.returnToPlaybackPosition(navigationId: navigationId))
}

@Test
func failed_explicit_return_restores_the_detached_viewport() {
  let state = TtsPlaybackNavigationState()
  state.beginTtsFollow()
  let navigationId = state.beginUserNavigation()
  _ = state.locationEvent()

  #expect(state.returnToPlaybackPosition(navigationId: navigationId))
  state.completeReturnToPlaybackPosition(
    navigationId: navigationId,
    succeeded: false
  )

  #expect(!state.isReturningToPlaybackPosition)
  #expect(!state.allowsTtsFollow)
  #expect(state.returnToPlaybackPosition(navigationId: navigationId))
}

@Test
func manual_navigation_cancels_an_explicit_return_in_progress() {
  let state = TtsPlaybackNavigationState()
  state.beginTtsFollow()
  let returnNavigationId = state.beginUserNavigation()
  _ = state.locationEvent()
  #expect(state.returnToPlaybackPosition(navigationId: returnNavigationId))

  let currentNavigationId = state.beginUserNavigation()
  state.completeReturnToPlaybackPosition(
    navigationId: returnNavigationId,
    succeeded: true
  )

  #expect(!state.isReturningToPlaybackPosition)
  #expect(!state.allowsTtsFollow)
  #expect(state.locationEvent().navigationId == currentNavigationId)
}

@Test
func stale_visibility_result_cannot_reattach_a_newer_viewport() {
  let state = TtsPlaybackNavigationState()
  state.beginTtsFollow()
  let oldNavigationId = state.beginUserNavigation()
  _ = state.locationEvent()
  let currentNavigationId = state.beginUserNavigation()
  _ = state.locationEvent()
  state.detachViewportForSession(navigationId: oldNavigationId)

  #expect(!state.reattachViewport(navigationId: oldNavigationId))
  #expect(!state.allowsTtsFollow)
  #expect(state.reattachViewport(navigationId: currentNavigationId))
  #expect(state.allowsTtsFollow)
}

@Test
func programmatic_navigation_is_distinguished_from_a_page_turn() {
  let state = TtsPlaybackNavigationState()

  let navigationId = state.beginUserNavigation(detachViewport: false)
  let event = state.locationEvent()

  #expect(event.source == "user")
  #expect(event.navigationId == navigationId)
  #expect(event.navigationKind == "programmatic")
}

@Test
func unchanged_boundary_navigation_restores_the_previous_tts_owner() {
  let state = TtsPlaybackNavigationState()
  state.beginTtsFollow()

  let navigationId = state.beginUserNavigation()

  #expect(state.cancelUserNavigationIfUnchanged(navigationId))
  #expect(state.locationEvent().source == "tts")
}

@Test
func new_session_clears_every_navigation_owner() {
  let state = TtsPlaybackNavigationState()
  state.beginTtsFollow()
  _ = state.beginUserNavigation()

  state.resetForSession()
  let event = state.locationEvent()

  #expect(event.source == nil)
  #expect(event.navigationId == nil)
  #expect(event.navigationKind == nil)
  #expect(state.allowsTtsFollow)
}

@Test
func setup_can_preserve_a_viewport_detached_before_native_playback_starts() {
  let state = TtsPlaybackNavigationState()

  state.detachViewportForSession(navigationId: "navigation-during-setup")

  #expect(!state.allowsTtsFollow)
  #expect(!state.reattachViewport(navigationId: "stale-navigation"))
  #expect(state.reattachViewport(navigationId: "navigation-during-setup"))
  state.resetForSession()
  #expect(state.allowsTtsFollow)
}
