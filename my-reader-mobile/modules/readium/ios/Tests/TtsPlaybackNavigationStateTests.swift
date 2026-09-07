import Testing
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
