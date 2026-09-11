import ReadiumShared

struct TtsPlaybackNavigationEvent: Equatable {
  let source: String?
  let navigationId: String?
  let navigationKind: String?
}

func ttsViewportStartLocator(
  current: Locator,
  cssSelector: String,
  domRange: JSONValue,
  text: Locator.Text
) -> Locator {
  current.copy(
    locations: { locations in
      // The DOM text anchor is more precise than a page-level progression.
      // In particular, Readium treats 1.0 as the resource's final text block.
      locations.progression = nil
      locations.otherLocations["cssSelector"] = .string(cssSelector)
      locations.otherLocations["domRange"] = domRange
    },
    text: { $0 = text }
  )
}

func ttsFollowStaysInCurrentResource(
  currentHref: String?,
  targetHref: String
) -> Bool {
  currentHref == targetHref
}

func ttsViewportStartHref(
  currentHref: String?,
  fallbackHref: String?,
  visibleHrefs: [String]
) -> String? {
  if let currentHref, visibleHrefs.contains(currentHref) { return currentHref }
  if let fallbackHref, visibleHrefs.contains(fallbackHref) { return fallbackHref }
  return visibleHrefs.first ?? currentHref ?? fallbackHref
}

func ttsProgressionIsVisible(
  targetHref: String,
  targetProgression: Double?,
  visibleProgressions: [String: ClosedRange<Double>]
) -> Bool? {
  guard !visibleProgressions.isEmpty else { return nil }
  guard let visibleProgression = visibleProgressions[targetHref] else {
    return false
  }
  guard let targetProgression else { return nil }
  return visibleProgression.contains(targetProgression)
}

func ttsLocatorIsVisible(
  progressionVisibility: Bool?,
  domRangeVisibility: Bool?
) -> Bool {
  if let domRangeVisibility { return domRangeVisibility }
  return progressionVisibility == true
}

struct TtsSentenceNavigationPlaybackState {
  private(set) var isPaused = false
  private var preservePauseOnNextPlayback = false
  private var waitingForPauseConfirmation = false

  mutating func beginSentenceNavigation() {
    preservePauseOnNextPlayback = isPaused
  }

  mutating func didStartPlaying() -> Bool {
    if preservePauseOnNextPlayback {
      preservePauseOnNextPlayback = false
      waitingForPauseConfirmation = true
    }
    if waitingForPauseConfirmation { return true }
    isPaused = false
    return false
  }

  mutating func didPause() {
    isPaused = true
    preservePauseOnNextPlayback = false
    waitingForPauseConfirmation = false
  }

  mutating func didStop() {
    isPaused = false
    preservePauseOnNextPlayback = false
    waitingForPauseConfirmation = false
  }
}

final class TtsPlaybackNavigationState {
  private enum NonUserOwner {
    case none
    case tts
  }

  private enum Owner {
    case none
    case tts
    case user(
      navigationId: String,
      previous: NonUserOwner,
      previousViewportDetached: Bool,
      previousViewportNavigationId: String?,
      navigationKind: String,
      changed: Bool
    )
  }

  private var owner: Owner = .none
  private var nextNavigationId = 0
  private var viewportDetached = false
  private var viewportNavigationId: String?
  private var returnNavigationId: String?

  var isReturningToPlaybackPosition: Bool {
    returnNavigationId != nil
  }

  var allowsTtsFollow: Bool {
    if viewportDetached { return false }
    if case .user = owner { return false }
    return true
  }

  func beginTtsFollow() {
    guard allowsTtsFollow else { return }
    owner = .tts
  }

  func endTtsFollow() {}

  func beginUserNavigation(detachViewport: Bool = true) -> String {
    returnNavigationId = nil
    let previousViewportDetached = viewportDetached
    let previousViewportNavigationId = viewportNavigationId
    let previous: NonUserOwner
    switch owner {
    case .none:
      previous = .none
    case .tts:
      previous = .tts
    case let .user(_, existingPrevious, _, _, _, _):
      previous = existingPrevious
    }
    nextNavigationId += 1
    let navigationId = String(nextNavigationId)
    if detachViewport {
      viewportDetached = true
      viewportNavigationId = navigationId
    }
    owner = .user(
      navigationId: navigationId,
      previous: previous,
      previousViewportDetached: previousViewportDetached,
      previousViewportNavigationId: previousViewportNavigationId,
      navigationKind: detachViewport ? "pageTurn" : "programmatic",
      changed: false
    )
    return navigationId
  }

  func viewportDidChange() {
    guard case let .user(
      navigationId,
      previous,
      previousViewportDetached,
      previousViewportNavigationId,
      navigationKind,
      _
    ) = owner else { return }
    owner = .user(
      navigationId: navigationId,
      previous: previous,
      previousViewportDetached: previousViewportDetached,
      previousViewportNavigationId: previousViewportNavigationId,
      navigationKind: navigationKind,
      changed: true
    )
  }

  func locationEvent() -> TtsPlaybackNavigationEvent {
    switch owner {
    case .none:
      return TtsPlaybackNavigationEvent(
        source: nil,
        navigationId: nil,
        navigationKind: nil
      )
    case .tts:
      return TtsPlaybackNavigationEvent(
        source: "tts",
        navigationId: nil,
        navigationKind: nil
      )
    case let .user(
      navigationId,
      _,
      _,
      _,
      navigationKind,
      _
    ):
      viewportDidChange()
      return TtsPlaybackNavigationEvent(
        source: "user",
        navigationId: navigationId,
        navigationKind: navigationKind
      )
    }
  }

  func cancelUserNavigationIfUnchanged(_ navigationId: String) -> Bool {
    guard case let .user(
      currentId,
      previous,
      previousViewportDetached,
      previousViewportNavigationId,
      _,
      changed
    ) = owner,
          currentId == navigationId,
          !changed else { return false }
    switch previous {
    case .none:
      owner = .none
    case .tts:
      owner = .tts
    }
    viewportDetached = previousViewportDetached
    viewportNavigationId = previousViewportNavigationId
    return true
  }

  func detachViewportForSession(navigationId: String?) {
    if viewportDetached,
       let currentNavigationId = viewportNavigationId,
       currentNavigationId != navigationId {
      return
    }
    viewportDetached = true
    viewportNavigationId = navigationId
  }

  @discardableResult
  func reattachViewport(navigationId: String) -> Bool {
    guard viewportDetached, viewportNavigationId == navigationId else {
      return false
    }
    viewportDetached = false
    viewportNavigationId = nil
    if case let .user(currentId, previous, _, _, _, _) = owner,
       currentId == navigationId {
      switch previous {
      case .none:
        owner = .none
      case .tts:
        owner = .tts
      }
    }
    return true
  }

  @discardableResult
  func returnToPlaybackPosition(navigationId: String) -> Bool {
    guard reattachViewport(navigationId: navigationId) else { return false }
    owner = .tts
    returnNavigationId = navigationId
    return true
  }

  func completeReturnToPlaybackPosition(
    navigationId: String,
    succeeded: Bool
  ) {
    guard returnNavigationId == navigationId else { return }
    returnNavigationId = nil
    if !succeeded {
      detachViewportForSession(navigationId: navigationId)
    }
  }

  func resetForSession() {
    owner = .none
    viewportDetached = false
    viewportNavigationId = nil
    returnNavigationId = nil
  }
}
