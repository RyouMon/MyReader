package com.myreader.readium.reader

import android.os.Bundle
import android.graphics.Color as AndroidColor
import android.view.*
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.myreader.readium.utils.EventChannel
import com.myreader.readium.utils.LinkOrLocator
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import org.readium.r2.navigator.Decoration
import org.readium.r2.navigator.DecorableNavigator
import org.readium.r2.navigator.Navigator
import org.readium.r2.navigator.OverflowableNavigator
import org.readium.r2.navigator.SelectableNavigator
import org.readium.r2.navigator.VisualNavigator
import org.readium.r2.navigator.input.InputListener
import org.readium.r2.navigator.input.TapEvent
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.services.positions

/*
 * Base reader fragment class
 *
 * Provides common menu items and saves last location on stop.
 */
abstract class BaseReaderFragment : Fragment() {
  val channel = EventChannel(
    Channel<ReaderViewModel.Event>(Channel.BUFFERED),
    lifecycleScope
  )

  protected abstract val model: ReaderViewModel
  protected abstract val navigator: Navigator

  /**
   * Navigators whose reading-direction semantics are not handled by Readium
   * itself (e.g. the CBZ image navigator) override this to reverse the edge-tap
   * navigation mapping when the user selects RTL.
   */
  protected open fun shouldReverseEdgeNavigation(): Boolean = false

  // Exposes the live Publication so the bridge (PublicationStore) can key
  // content/snapshot lookups off the same object the navigator renders.
  val publication: org.readium.r2.shared.publication.Publication
    get() = model.publication

  fun clearSelection() {
    (navigator as? SelectableNavigator)?.clearSelection()
  }

  // Track active decoration listeners to avoid duplicates
  private val activeDecorationGroups = mutableSetOf<String>()

  // Store decorations if they're set before navigator is ready
  private var pendingDecorations: Map<String, List<Decoration>>? = null

  // Store background color if it's set before the navigator view is ready
  private var pendingBackgroundColor: String? = null

  // Center tap zone used to toggle chrome. Taps outside this zone are left
  // for Readium's default edge navigation (page turns, etc.).
  private val CENTER_TAP_START_RATIO = 0.25f
  private val CENTER_TAP_END_RATIO = 0.75f

  // Listen to taps in the navigator to toggle chrome from JS
  private val tapInputListener = object : InputListener {
    override fun onTap(event: TapEvent): Boolean {
      val visualNavigator = navigator as? VisualNavigator ?: return false
      val publicationView = visualNavigator.publicationView
      val width = publicationView.width.toFloat()
      val height = publicationView.height.toFloat()
      if (width <= 0f || height <= 0f) return false

      val xRatio = event.point.x / width
      val yRatio = event.point.y / height
      val inCenterRegion =
        xRatio in CENTER_TAP_START_RATIO..CENTER_TAP_END_RATIO &&
        yRatio in CENTER_TAP_START_RATIO..CENTER_TAP_END_RATIO
      if (inCenterRegion) {
        val viewScope = viewLifecycleOwner.lifecycleScope
        viewScope.launch {
          channel.send(ReaderViewModel.Event.Tap(point = event.point))
        }
        return false
      }

      // On Android, returning false from an input listener does not reliably
      // trigger Readium's default edge-tap page turn, so navigate explicitly.
      // The image navigator ignores readingProgression, so we reverse the edge
      // mapping ourselves when the user selected RTL.
      val overflowNav = navigator as? OverflowableNavigator ?: return false
      val reverseEdges = shouldReverseEdgeNavigation()
      return when {
        xRatio < CENTER_TAP_START_RATIO -> if (reverseEdges) overflowNav.goForward(animated = true) else overflowNav.goBackward(animated = true)
        xRatio > CENTER_TAP_END_RATIO -> if (reverseEdges) overflowNav.goBackward(animated = true) else overflowNav.goForward(animated = true)
        else -> false
      }
    }
  }

  // Check if navigator is ready to use
  private val isNavigatorReady: Boolean
    get() {
      if (view == null) return false
      return try {
        navigator
        true
      } catch (e: UninitializedPropertyAccessException) {
        false
      }
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    setHasOptionsMenu(true)
    super.onCreate(savedInstanceState)
  }

  override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
    super.onViewCreated(view, savedInstanceState)

    val viewScope = viewLifecycleOwner.lifecycleScope

    // Emit PublicationReady event with all metadata
    viewScope.launch {
      // positions() is a suspending function that returns List<Locator>
      val positions = try {
        model.publication.positions()
      } catch (e: Exception) {
        emptyList<Locator>()
      }

      channel.send(
        ReaderViewModel.Event.PublicationReady(
          tableOfContents = model.publication.tableOfContents,
          positions = positions,
          metadata = model.publication.metadata,
          canSelectText = navigator is SelectableNavigator,
          canDecorate = navigator is DecorableNavigator,
          supportedDecorationStyles = (navigator as? DecorableNavigator)?.let { decorable ->
            buildList {
              if (decorable.supportsDecorationStyle(Decoration.Style.Highlight::class)) add("highlight")
              if (decorable.supportsDecorationStyle(Decoration.Style.Underline::class)) add("underline")
              if (decorable.supportsDecorationStyle(ReaderNoteMarkerDecorationStyle::class)) {
                add("myreader-note-marker")
              }
            }
          } ?: emptyList()
        )
      )
    }

    navigator.currentLocator
      .onEach { channel.send(ReaderViewModel.Event.LocatorUpdate(it)) }
      .launchIn(viewScope)

    // Listen to single taps to let JS toggle chrome on Android, where the
    // native navigator consumes touch events before React Native sees them.
    (navigator as? VisualNavigator)?.addInputListener(tapInputListener)

    // Apply any pending decorations now that navigator is ready
    pendingDecorations?.let { applyDecorations(it) }

  }

  override fun onDestroyView() {
    (navigator as? VisualNavigator)?.removeInputListener(tapInputListener)
    super.onDestroyView()
  }

  override fun onHiddenChanged(hidden: Boolean) {
    super.onHiddenChanged(hidden)
    setMenuVisibility(!hidden)
    requireActivity().invalidateOptionsMenu()
  }

  fun go(location: LinkOrLocator, animated: Boolean): Boolean {
    // Check if navigator is initialized
    if (!isNavigatorReady) {
      android.util.Log.w("BaseReaderFragment", "Navigator not initialized yet")
      return false
    }

    var locator: Locator? = null
    when (location) {
      is LinkOrLocator.Link -> {
        locator = model.publication.locatorFromLink(location.link)
      }
      is LinkOrLocator.Locator -> {
        locator = location.locator
      }
    }

    if (locator == null) {
      return false
    }

    // don't attempt to navigate if we're already there
    val currentLocator = navigator.currentLocator.value
    if (locator.hashCode() == currentLocator.hashCode()) {
      return true
    }

    return navigator.go(locator, animated)
  }

  fun goForward(): Boolean {
    if (!isNavigatorReady) return false
    val overflowNav = navigator as? OverflowableNavigator ?: return false
    return overflowNav.goForward(animated = true)
  }

  fun goBackward(): Boolean {
    if (!isNavigatorReady) return false
    val overflowNav = navigator as? OverflowableNavigator ?: return false
    return overflowNav.goBackward(animated = true)
  }

  /**
   * Apply the user-selected reading progression ("ltr" / "rtl") to the
   * navigator. EPUB and PDF navigators consume this through their preferences
   * API; image-based navigators can override this to implement the behavior
   * manually.
   */
  open fun applyReadingProgression(readingProgression: String?) {}

  /**
   * Apply a background color to the navigator surface. This is used on Android
   * for formats whose Readium navigator does not expose a backgroundColor
   * preference (PDF via pdfium, CBZ via image navigator).
   */
  open fun setReaderBackgroundColor(colorString: String?) {
    pendingBackgroundColor = colorString
    applyReaderBackgroundColor()
  }

  private fun applyReaderBackgroundColor() {
    if (!isNavigatorReady) return
    val colorString = pendingBackgroundColor ?: return
    val colorInt = try {
      AndroidColor.parseColor(colorString)
    } catch (e: IllegalArgumentException) {
      android.util.Log.w("BaseReaderFragment", "Invalid background color: $colorString")
      return
    }

    // Try the navigator's own publication view first; fall back to the fragment root.
    (navigator as? VisualNavigator)?.publicationView?.setBackgroundColor(colorInt)
    view?.setBackgroundColor(colorInt)
  }

  /**
   * Apply pre-converted Readium decoration groups directly (no JSON round-trip).
   */
  fun applyDecorations(groups: Map<String, List<Decoration>>?) {
    if (groups == null) {
      pendingDecorations = null
      return
    }

    // Check if navigator is initialized
    if (!isNavigatorReady) {
      pendingDecorations = groups
      return
    }

    val decorableNavigator = navigator as? DecorableNavigator
    if (decorableNavigator == null) {
      android.util.Log.w("BaseReaderFragment", "Navigator does not support decorations")
      return
    }

    val viewScope = viewLifecycleOwner.lifecycleScope

    groups.forEach { (group, decorations) ->
      viewScope.launch {
        decorableNavigator.applyDecorations(decorations, group)
      }

      // Set up listener for this group if not already active
      if (!activeDecorationGroups.contains(group)) {
        activeDecorationGroups.add(group)
        setupDecorationListener(decorableNavigator, group)
      }
    }

    // Clear pending decorations as they've been applied
    pendingDecorations = null
  }

  /**
   * Set up a decoration listener for a specific group
   */
  private fun setupDecorationListener(decorableNavigator: DecorableNavigator, group: String) {
    val viewScope = viewLifecycleOwner.lifecycleScope

    decorableNavigator.addDecorationListener(group, object : DecorableNavigator.Listener {
      override fun onDecorationActivated(event: DecorableNavigator.OnActivatedEvent): Boolean {
        viewScope.launch {
          channel.send(
            ReaderViewModel.Event.DecorationActivated(
              decoration = event.decoration,
              group = event.group,
              rect = event.rect,
              point = event.point
            )
          )
        }
        return true
      }
    })
  }

  /**
   * Get the current text selection from the navigator
   * Returns the selection locator which includes text position information needed for highlighting
   */
  suspend fun getCurrentSelection(): Locator? {
    if (!isNavigatorReady) {
      android.util.Log.w("BaseReaderFragment", "Navigator not initialized yet")
      return null
    }

    val selectableNavigator = navigator as? SelectableNavigator
    if (selectableNavigator == null) {
      android.util.Log.w("BaseReaderFragment", "Navigator does not support text selection")
      return null
    }

    val selection = selectableNavigator.currentSelection()
    if (selection == null) {
      return null
    }

    return selection.locator
  }

}
