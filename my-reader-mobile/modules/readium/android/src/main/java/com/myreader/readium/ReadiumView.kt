package com.myreader.readium

import android.content.Context
import android.content.ContextWrapper
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Choreographer
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.fragment.app.FragmentActivity
import com.myreader.readium.Converters.decorationRecordToReadium
import com.myreader.readium.Converters.flattenReadiumLinksToMaps
import com.myreader.readium.Converters.locatorRecordToReadium
import com.myreader.readium.Converters.preferencesRecordToEpub
import com.myreader.readium.Converters.preferencesRecordToPdf
import com.myreader.readium.Converters.readiumDecorationToMap
import com.myreader.readium.Converters.readiumLocatorToMap
import com.myreader.readium.Converters.readiumMetadataToMap
import com.myreader.readium.Streamer.PublicationStore
import com.myreader.readium.Types.DecorationGroupRecord
import com.myreader.readium.Types.LocatorRecord
import com.myreader.readium.Types.PreferencesRecord
import com.myreader.readium.Types.ReadiumFileRecord
import com.myreader.readium.Types.SelectionActionRecord
import com.myreader.readium.reader.BaseReaderFragment
import com.myreader.readium.reader.EpubReaderFragment
import com.myreader.readium.reader.ImageReaderFragment
import com.myreader.readium.reader.PdfReaderFragment
import com.myreader.readium.reader.ReaderService
import com.myreader.readium.reader.ReaderViewModel
import com.myreader.readium.reader.SelectionAction as FragmentSelectionAction
import com.myreader.readium.utils.LinkOrLocator
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.readium.r2.navigator.Decoration as ReadiumDecoration

class ReadiumView(
  context: Context,
  appContext: AppContext,
) : ExpoView(context, appContext) {

  companion object {
    private const val TAG = "ReadiumView"

    // React-tag (view.id) -> ReadiumView registry, so the module's imperative
    // functions (goTo/goForward/goBackward) can resolve a view from the tag JS
    // passes in via findNodeHandle.
    val registry = mutableMapOf<Int, ReadiumView>()
  }

  private val hostView = FrameLayout(context)
  private val mainHandler = Handler(Looper.getMainLooper())
  private var scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
  private var svc: ReaderService? = null
  private var fragment: BaseReaderFragment? = null
  private var isFragmentAdded = false
  private var isBuilding = false
  private var isAttached = false
  private var isDestroyed = false
  private var frameCallback: Choreographer.FrameCallback? = null
  private var pendingTeardownRunnable: Runnable? = null

  // MARK: - Events

  private val onLocationChange by EventDispatcher<Map<String, Any?>>()
  private val onPublicationReady by EventDispatcher<Map<String, Any?>>()
  private val onDecorationActivated by EventDispatcher<Map<String, Any?>>()
  private val onSelectionChange by EventDispatcher<Map<String, Any?>>()
  private val onSelectionAction by EventDispatcher<Map<String, Any?>>()
  private val onTap by EventDispatcher<Map<String, Any?>>()

  init {
    addView(
      hostView,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT
      )
    )
    hostView.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
      override fun onViewAttachedToWindow(v: View) {
        isAttached = true
        pendingTeardownRunnable?.let { mainHandler.removeCallbacks(it) }
        pendingTeardownRunnable = null
        buildForViewIfReady()
      }

      override fun onViewDetachedFromWindow(v: View) {
        isAttached = false
        val runnable = Runnable {
          pendingTeardownRunnable = null
          teardownFragment()
        }
        pendingTeardownRunnable = runnable
        mainHandler.postDelayed(runnable, 300)
      }
    })
  }

  // MARK: - Props

  var file: ReadiumFileRecord? = null
    set(value) {
      val previousUrl = field?.url
      field = value
      if (value != null) {
        if (isFragmentAdded && value.url != previousUrl) {
          teardownFragment()
        }
        buildForViewIfReady()
      }
    }

  var preferences: PreferencesRecord? = null
    set(value) {
      field = value
      updatePreferences()
    }

  var decorations: List<DecorationGroupRecord>? = null
    set(value) {
      field = value
      updateDecorations()
    }

  var selectionActions: List<SelectionActionRecord>? = null
    set(value) {
      field = value
      updateSelectionActions()
    }

  private fun ensureService() {
    if (svc == null) {
      svc = ReaderService(appContext.reactContext ?: throw Exceptions.ReactContextLost())
    }
  }

  // MARK: - Preferences

  private fun updatePreferences() {
    val prefs = preferences ?: return
    val frag = fragment ?: return
    when (frag) {
      is EpubReaderFragment -> frag.updatePreferences(preferencesRecordToEpub(prefs))
      is PdfReaderFragment -> frag.updatePreferences(preferencesRecordToPdf(prefs))
      is ImageReaderFragment -> { /* image navigator has no preferences API; background is handled below */ }
      else -> {}
    }
    // Apply reading direction to navigators that need manual help (CBZ).
    frag.applyReadingProgression(prefs.readingProgression)
    // Apply background color through the bridge for all navigators, since Android
    // pdfium and image navigators don't expose backgroundColor in their preferences.
    frag.setReaderBackgroundColor(prefs.backgroundColor)
  }

  // MARK: - Decorations

  private fun updateDecorations() {
    val groups = decorations ?: return
    val frag = fragment ?: return

    val readiumGroups = mutableMapOf<String, List<ReadiumDecoration>>()
    for (group in groups) {
      readiumGroups[group.name] =
        group.decorations?.mapNotNull { decorationRecordToReadium(it) } ?: emptyList()
    }

    frag.applyDecorations(readiumGroups)
  }

  // MARK: - Selection Actions

  private fun updateSelectionActions() {
    val actions = selectionActions?.takeIf { it.isNotEmpty() } ?: return
    val frag = fragment as? EpubReaderFragment ?: return
    frag.updateSelectionActions(actions.map { FragmentSelectionAction(it.id, it.label) })
  }

  // MARK: - Imperative navigation

  fun goTo(locator: LocatorRecord) {
    val action = Runnable {
      val readiumLocator = locatorRecordToReadium(locator) ?: return@Runnable
      fragment?.go(LinkOrLocator.Locator(readiumLocator), true)
    }
    if (Looper.myLooper() == Looper.getMainLooper()) {
      action.run()
    } else {
      hostView.post(action)
    }
  }

  fun goForward() {
    fragment?.goForward()
  }

  fun goBackward() {
    fragment?.goBackward()
  }

  // MARK: - Fragment management

  private fun teardownFragment() {
    pendingTeardownRunnable?.let { mainHandler.removeCallbacks(it) }
    pendingTeardownRunnable = null

    registry.remove(this.id)

    frameCallback?.let {
      try {
        Choreographer.getInstance().removeFrameCallback(it)
      } catch (e: Exception) {
        Log.w(TAG, "Failed to remove frame callback during teardown: ${e.message}")
      }
    }
    frameCallback = null

    fragment?.let { frag ->
      try {
        findActivity()?.supportFragmentManager
          ?.beginTransaction()
          ?.remove(frag)
          ?.commitNowAllowingStateLoss()
      } catch (e: Exception) {
        Log.w(TAG, "teardownFragment: failed to remove fragment: ${e.message}")
      }
    }

    hostView.removeAllViews()
    fragment = null
    isFragmentAdded = false
    isBuilding = false

    scope.cancel()
    scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
  }

  internal fun cleanup() {
    if (isDestroyed) return
    isDestroyed = true

    teardownFragment()
    (hostView.parent as? ViewGroup)?.removeView(hostView)
  }

  private fun buildForViewIfReady() {
    if (isDestroyed) return
    if (!isAttached) return
    if (isFragmentAdded) return
    if (isBuilding) return
    val currentFile = file ?: return
    val fileUrl = currentFile.url
    if (fileUrl.isEmpty()) return

    ensureService()
    val service = svc ?: return

    isBuilding = true

    val path = fileUrl.replace("^(file:/+)?(/.*)$".toRegex(), "$2")

    val initialLocator = currentFile.initialLocation?.let { loc ->
      locatorRecordToReadium(loc)?.let { LinkOrLocator.Locator(it) }
    }

    scope.launch {
      service.openPublication(path, initialLocator) { frag ->
        addFragment(frag)
      }
    }
  }

  private fun addFragment(frag: BaseReaderFragment) {
    if (isFragmentAdded) return

    // Force-clear any stale instances whose hostViews are still in the view
    // tree from a key-change remount.
    registry.values.toList().filter { it !== this }.forEach { other ->
      other.cleanup()
    }
    registry[this.id] = this

    fragment = frag
    isFragmentAdded = true
    setupLayout()

    val activity = findActivity()
    if (activity == null) {
      Log.e(TAG, "Could not find FragmentActivity")
      return
    }

    hostView.id = View.generateViewId()

    // Apply selection actions BEFORE committing so they're available during
    // onCreate when the callback is conditionally registered.
    selectionActions?.takeIf { it.isNotEmpty() }?.let { actions ->
      if (frag is EpubReaderFragment) {
        frag.updateSelectionActions(actions.map { FragmentSelectionAction(it.id, it.label) })
      }
    }

    preferences?.let { updatePreferences() }
    decorations?.let { updateDecorations() }

    activity.supportFragmentManager
      .beginTransaction()
      .replace(hostView.id, frag, hostView.id.toString())
      .commitNow()

    // The FragmentManager may not find hostView via activity.findViewById()
    // in React Native's view tree. Manually add the fragment's view to
    // hostView if needed.
    frag.view?.let { fragView ->
      if (fragView.parent !== hostView) {
        (fragView.parent as? ViewGroup)?.removeView(fragView)
        hostView.addView(
          fragView,
          FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
          )
        )
      } else {
        fragView.layoutParams = FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT
        )
      }
    } ?: Log.w(TAG, "addFragment: fragment view is null after commitNow!")

    // Apply the reader background color now that the fragment (and its child
    // navigator) has a view. EPUB handles this via CSS; PDF/CBZ need the bridge.
    preferences?.backgroundColor?.let { frag.setReaderBackgroundColor(it) }

    frag.channel.receive(frag) { event ->
      when (event) {
        is ReaderViewModel.Event.LocatorUpdate -> {
          onLocationChange(mapOf<String, Any?>("locator" to readiumLocatorToMap(event.locator)))
        }

        is ReaderViewModel.Event.PublicationReady -> {
          // publicationId is the file URL string — same key JS uses for
          // getContent / getPublicationSnapshot / search (REP-003 handle).
          val pubId = file?.url ?: ""
          PublicationStore.set(pubId, frag.publication)
          onPublicationReady(
            mapOf<String, Any?>(
              "publicationId" to pubId,
              "tableOfContents" to flattenReadiumLinksToMaps(event.tableOfContents),
              "positions" to event.positions.map { readiumLocatorToMap(it) },
              "metadata" to readiumMetadataToMap(event.metadata)
            )
          )
        }

        is ReaderViewModel.Event.DecorationActivated -> {
          val rect = event.rect?.let {
            mapOf<String, Any?>(
              "x" to it.left.toDouble(),
              "y" to it.top.toDouble(),
              "width" to it.width().toDouble(),
              "height" to it.height().toDouble()
            )
          }
          val point = event.point?.let {
            mapOf<String, Any?>("x" to it.x.toDouble(), "y" to it.y.toDouble())
          }
          onDecorationActivated(
            mapOf<String, Any?>(
              "decoration" to readiumDecorationToMap(event.decoration),
              "group" to event.group,
              "rect" to rect,
              "point" to point
            )
          )
        }

        is ReaderViewModel.Event.SelectionChanged -> {
          onSelectionChange(
            mapOf<String, Any?>(
              "locator" to (event.locator?.let { readiumLocatorToMap(it) }),
              "selectedText" to event.selectedText
            )
          )
        }

        is ReaderViewModel.Event.SelectionAction -> {
          onSelectionAction(
            mapOf<String, Any?>(
              "locator" to readiumLocatorToMap(event.locator),
              "selectedText" to event.selectedText,
              "actionId" to event.actionId
            )
          )
        }

        is ReaderViewModel.Event.Tap -> {
          onTap(
            mapOf<String, Any?>(
              "point" to mapOf<String, Any?>(
                "x" to event.point.x.toDouble(),
                "y" to event.point.y.toDouble()
              )
            )
          )
        }
      }
    }
  }

  private fun setupLayout() {
    frameCallback = object : Choreographer.FrameCallback {
      override fun doFrame(frameTimeNanos: Long) {
        manuallyLayoutChildren()
        hostView.viewTreeObserver.dispatchOnGlobalLayout()
        Choreographer.getInstance().postFrameCallback(this)
      }
    }
    frameCallback?.let { Choreographer.getInstance().postFrameCallback(it) }
  }

  private fun manuallyLayoutChildren() {
    val w = hostView.measuredWidth
    val h = hostView.measuredHeight
    if (w <= 0 || h <= 0) return

    for (i in 0 until hostView.childCount) {
      val child = hostView.getChildAt(i)
      child.measure(
        View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY),
        View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY)
      )
      child.layout(0, 0, w, h)
    }
  }

  private fun findActivity(): FragmentActivity? {
    var ctx: Context? = hostView.context
    while (ctx != null) {
      if (ctx is FragmentActivity) return ctx
      ctx = (ctx as? ContextWrapper)?.baseContext
    }
    return null
  }
}
