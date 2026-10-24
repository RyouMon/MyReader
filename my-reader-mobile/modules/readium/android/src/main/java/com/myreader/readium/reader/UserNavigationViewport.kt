package com.myreader.readium.reader

import android.graphics.Rect
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

internal class UserNavigationViewport private constructor(private val view: WebView) {
  private data class Position(val url: String?, val x: Int, val y: Int, val bounds: Rect)

  private fun position(): Position? {
    val bounds = Rect()
    if (!view.getGlobalVisibleRect(bounds)) return null
    return Position(view.url, view.scrollX, view.scrollY, bounds)
  }

  private val origin = position()

  suspend fun unchangedAfterSettling(): Boolean = withTimeoutOrNull(5_000) {
    var previous: Position? = null
    var stableFrames = 0
    while (view.getGlobalVisibleRect(Rect())) {
      suspendCancellableCoroutine { continuation ->
        val frame = Runnable {
          if (continuation.isActive) continuation.resume(Unit)
        }
        view.postOnAnimation(frame)
        continuation.invokeOnCancellation { view.removeCallbacks(frame) }
      }
      // A native frame alone says nothing about a busy WebView renderer.
      suspendCancellableCoroutine { continuation ->
        view.postVisualStateCallback(0, object : WebView.VisualStateCallback() {
          override fun onComplete(requestId: Long) {
            if (continuation.isActive) continuation.resume(Unit)
          }
        })
      }
      val current = position() ?: return@withTimeoutOrNull false
      stableFrames = if (current == previous) stableFrames + 1 else 0
      if (stableFrames >= 2) return@withTimeoutOrNull current == origin
      previous = current
    }
    false
  } ?: false

  companion object {
    fun capture(root: View?): UserNavigationViewport? {
      if (root is WebView && root.getGlobalVisibleRect(Rect())) {
        return UserNavigationViewport(root)
      }
      if (root is ViewGroup) for (index in 0 until root.childCount) {
        capture(root.getChildAt(index))?.let { return it }
      }
      return null
    }
  }
}
