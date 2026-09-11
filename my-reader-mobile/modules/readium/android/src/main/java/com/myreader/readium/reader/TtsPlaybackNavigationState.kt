package com.myreader.readium.reader

import org.readium.r2.shared.publication.Locator

internal data class TtsPlaybackNavigationEvent(
  val source: String?,
  val navigationId: String?,
  val navigationKind: String?,
)

internal fun ttsViewportStartLocator(
  current: Locator,
  cssSelector: String,
  domRange: Map<String, Any?>,
  text: Locator.Text,
): Locator = current.copy(
  locations = current.locations.copy(
    // The DOM text anchor is more precise than a page-level progression.
    // In particular, Readium treats 1.0 as the resource's final text block.
    progression = null,
    otherLocations = current.locations.otherLocations + mapOf(
      "cssSelector" to cssSelector,
      "domRange" to domRange,
    ),
  ),
  text = text,
)

internal class TtsPlaybackNavigationState {
  private enum class NonUserOwner { None, Tts }

  private sealed interface Owner {
    data object None : Owner
    data object Tts : Owner
    data class User(
      val navigationId: String,
      val previous: NonUserOwner,
      val previousViewportDetached: Boolean,
      val previousViewportNavigationId: String?,
      val navigationKind: String,
      val changed: Boolean,
    ) : Owner
  }

  private var owner: Owner = Owner.None
  private var nextNavigationId = 0L
  private var viewportDetached = false
  private var viewportNavigationId: String? = null
  private var returnNavigationId: String? = null

  val isReturningToPlaybackPosition: Boolean
    get() = returnNavigationId != null

  val allowsTtsFollow: Boolean
    get() = !viewportDetached && owner !is Owner.User

  fun beginTtsFollow() {
    if (owner !is Owner.User) owner = Owner.Tts
  }

  fun endTtsFollow() = Unit

  fun beginUserNavigation(detachViewport: Boolean = true): String {
    returnNavigationId = null
    val previousViewportDetached = viewportDetached
    val previousViewportNavigationId = viewportNavigationId
    val previous = when (val current = owner) {
      Owner.None -> NonUserOwner.None
      Owner.Tts -> NonUserOwner.Tts
      is Owner.User -> current.previous
    }
    val navigationId = (++nextNavigationId).toString()
    if (detachViewport) {
      viewportDetached = true
      viewportNavigationId = navigationId
    }
    owner = Owner.User(
      navigationId = navigationId,
      previous = previous,
      previousViewportDetached = previousViewportDetached,
      previousViewportNavigationId = previousViewportNavigationId,
      navigationKind = if (detachViewport) "pageTurn" else "programmatic",
      changed = false,
    )
    return navigationId
  }

  fun locationEvent(): TtsPlaybackNavigationEvent = when (val current = owner) {
    Owner.None -> TtsPlaybackNavigationEvent(
      source = null,
      navigationId = null,
      navigationKind = null,
    )
    Owner.Tts -> TtsPlaybackNavigationEvent(
      source = "tts",
      navigationId = null,
      navigationKind = null,
    )
    is Owner.User -> {
      owner = current.copy(changed = true)
      TtsPlaybackNavigationEvent(
        source = "user",
        navigationId = current.navigationId,
        navigationKind = current.navigationKind,
      )
    }
  }

  fun cancelUserNavigationIfUnchanged(navigationId: String): Boolean {
    val current = owner as? Owner.User ?: return false
    if (current.navigationId != navigationId || current.changed) return false
    owner = when (current.previous) {
      NonUserOwner.None -> Owner.None
      NonUserOwner.Tts -> Owner.Tts
    }
    viewportDetached = current.previousViewportDetached
    viewportNavigationId = current.previousViewportNavigationId
    return true
  }

  fun detachViewportForSession(navigationId: String?) {
    if (
      viewportDetached &&
      viewportNavigationId != null &&
      viewportNavigationId != navigationId
    ) return
    viewportDetached = true
    viewportNavigationId = navigationId
  }

  fun reattachViewport(navigationId: String): Boolean {
    if (!viewportDetached || viewportNavigationId != navigationId) return false
    viewportDetached = false
    viewportNavigationId = null
    owner = when (val current = owner) {
      is Owner.User -> if (current.navigationId == navigationId) {
        when (current.previous) {
          NonUserOwner.None -> Owner.None
          NonUserOwner.Tts -> Owner.Tts
        }
      } else current
      else -> current
    }
    return true
  }

  fun returnToPlaybackPosition(navigationId: String): Boolean {
    if (!reattachViewport(navigationId)) return false
    owner = Owner.Tts
    returnNavigationId = navigationId
    return true
  }

  fun completeReturnToPlaybackPosition(
    navigationId: String,
    succeeded: Boolean,
  ) {
    if (returnNavigationId != navigationId) return
    returnNavigationId = null
    if (!succeeded) detachViewportForSession(navigationId)
  }

  fun resetForSession() {
    owner = Owner.None
    viewportDetached = false
    viewportNavigationId = null
    returnNavigationId = null
  }
}
