struct TtsPlaybackNavigationEvent: Equatable {
  let source: String?
  let navigationId: String?
  let navigationKind: String?
}

func ttsFollowStaysInCurrentResource(
  currentHref: String?,
  targetHref: String
) -> Bool {
  currentHref == targetHref
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
      previous,
      previousViewportDetached,
      previousViewportNavigationId,
      navigationKind,
      _
    ):
      owner = .user(
        navigationId: navigationId,
        previous: previous,
        previousViewportDetached: previousViewportDetached,
        previousViewportNavigationId: previousViewportNavigationId,
        navigationKind: navigationKind,
        changed: true
      )
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

  func resetForSession() {
    owner = .none
    viewportDetached = false
    viewportNavigationId = nil
  }
}
