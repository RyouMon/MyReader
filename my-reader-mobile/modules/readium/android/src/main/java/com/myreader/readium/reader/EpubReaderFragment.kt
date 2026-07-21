/*
 * Copyright 2021 Readium Foundation. All rights reserved.
 * Use of this source code is governed by the BSD-style license
 * available in the top-level LICENSE file of the project.
 */

package com.myreader.readium.reader

import android.graphics.Color
import android.graphics.Rect
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.os.Bundle
import android.view.*
import android.view.accessibility.AccessibilityManager
import android.widget.HorizontalScrollView
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.PopupWindow
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.commitNow
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.myreader.readium.R
import com.myreader.readium.Converters.locatorRecordToReadium
import com.myreader.readium.Converters.readiumLocatorToMap
import com.myreader.readium.Types.FontFamilyDeclarationRecord
import com.myreader.readium.Types.FontFaceDeclarationRecord
import com.myreader.readium.Types.LocatorRecord
import com.myreader.readium.Types.SelectionMenuRecord
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import org.readium.r2.navigator.DecorableNavigator
import org.readium.r2.navigator.Selection
import org.readium.r2.navigator.SelectableNavigator
import org.readium.r2.navigator.epub.EpubNavigatorFragment
import org.readium.r2.navigator.Navigator
import org.readium.r2.navigator.VisualNavigator
import org.readium.r2.navigator.epub.EpubPreferences
import org.readium.r2.navigator.epub.EpubNavigatorFactory
import org.readium.r2.navigator.epub.css.FontStyle
import org.readium.r2.navigator.epub.css.FontWeight
import org.readium.r2.navigator.preferences.FontFamily
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Publication
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import kotlin.coroutines.resume

data class SelectionAction(
    val id: String,
    val label: String
)

data class ViewportAnchor(
    val locator: Locator,
    val yRatio: Double?
)

class EpubReaderFragment : VisualReaderFragment() {

    override lateinit var model: ReaderViewModel
    override lateinit var navigator: Navigator
    lateinit var navigatorFragment: EpubNavigatorFragment
    private lateinit var factory: ReaderViewModel.Factory
    private lateinit var navigatorFactory: EpubNavigatorFactory
    private var pendingPreferences: EpubPreferences? = null

    private lateinit var userPreferences: EpubPreferences

    // Accessibility
    private var isExploreByTouchEnabled = false

    // Selection actions configuration
    private var selectionActions: List<SelectionAction> = emptyList()
    private var selectionMenu: SelectionMenuRecord? = null
    private var customSelectionMenu = false
    private var selectionPopup: PopupWindow? = null
    private var shownSelectionMenu: SelectionMenuRecord? = null
    private var ignoringPopupDismiss = false
    private var selectionRequestGeneration = 0L
    private var fontFamilyDeclarations: List<FontFamilyDeclarationRecord> = emptyList()

    suspend fun captureViewportAnchor(): ViewportAnchor? {
      if (!this::navigatorFragment.isInitialized) return null
      val anchor = decodeJavascriptValue(
        navigatorFragment.evaluateJavascript(captureReaderBookmarkAnchorScript)
      ) as? JSONObject ?: return null
      val cssSelector = anchor.optString("cssSelector").takeIf { it.isNotEmpty() }
        ?: return null
      val domRange = anchor.optJSONObject("domRange")?.toMap() ?: return null
      val text = anchor.optJSONObject("text") ?: return null
      val current = navigatorFragment.currentLocator.value
      return ViewportAnchor(
        locator = current.copy(
          locations = current.locations.copy(
            otherLocations = current.locations.otherLocations + mapOf(
              "cssSelector" to cssSelector,
              "domRange" to domRange
            )
          ),
          text = Locator.Text(
            before = text.optString("before").takeIf { it.isNotEmpty() },
            highlight = text.optString("highlight").takeIf { it.isNotEmpty() },
            after = text.optString("after").takeIf { it.isNotEmpty() }
          )
        ),
        yRatio = anchor.optDouble("yRatio", Double.NaN)
          .takeUnless { it.isNaN() }
      )
    }

    suspend fun restoreViewportAnchorOffset(anchor: ViewportAnchor): Boolean {
      if (!this::navigatorFragment.isInitialized) return false
      val domRange = anchor.locator.locations.otherLocations["domRange"]
        ?.let { JSONObject(it as Map<*, *>) }
        ?: return false
      val yRatio = anchor.yRatio ?: return false
      return decodeJavascriptValue(
        navigatorFragment.evaluateJavascript(
          readerViewportAnchorOffsetRestoreScript(domRange.toString(), yRatio)
        )
      ) == true
    }

    suspend fun getBookmarkLocator(): Map<String, Any?>? =
      captureViewportAnchor()?.let { readiumLocatorToMap(it.locator) }

    fun currentViewportLocator(): Locator? =
      if (this::navigatorFragment.isInitialized) navigatorFragment.currentLocator.value else null

    suspend fun awaitViewportLayoutStable(): Boolean {
      if (!this::navigatorFragment.isInitialized) return false
      var previousSignature: String? = null
      var stableFrames = 0

      repeat(12) {
        awaitNextFrame()
        val state = decodeJavascriptValue(
          navigatorFragment.evaluateJavascript(readerViewportLayoutStateScript)
        ) as? JSONObject ?: return@repeat
        val signature = listOf(
          state.optInt("clientWidth"),
          state.optInt("clientHeight"),
          state.optInt("scrollWidth"),
          state.optInt("scrollHeight")
        ).joinToString(":")
        stableFrames = if (
          state.optBoolean("fontsLoaded") && signature == previousSignature
        ) {
          stableFrames + 1
        } else {
          0
        }
        if (stableFrames >= 2) return true
        previousSignature = signature
      }
      return false
    }

    private suspend fun awaitNextFrame() {
      val target = navigatorFragment.view ?: view ?: return
      suspendCancellableCoroutine { continuation ->
        val callback = Runnable {
          if (continuation.isActive) continuation.resume(Unit)
        }
        target.postOnAnimation(callback)
        continuation.invokeOnCancellation { target.removeCallbacks(callback) }
      }
    }

    suspend fun isBookmarkVisible(locator: LocatorRecord): Boolean {
      if (!this::navigatorFragment.isInitialized) return false
      val domRange = locator.locations?.domRange ?: return false
      val raw = navigatorFragment.evaluateJavascript(
        readerBookmarkVisibilityScript(JSONObject(domRange).toString())
      )
      return decodeJavascriptValue(raw) == true
    }

    private fun decodeJavascriptValue(raw: String?): Any? {
      if (raw == null) return null
      val value = runCatching { JSONTokener(raw).nextValue() }.getOrNull()
      return if (value is String) {
        runCatching { JSONTokener(value).nextValue() }.getOrDefault(value)
      } else {
        value
      }
    }

    private fun JSONObject.toMap(): Map<String, Any?> = keys().asSequence()
      .associateWith { key -> jsonValueToKotlin(get(key)) }

    private fun jsonValueToKotlin(value: Any?): Any? = when (value) {
      JSONObject.NULL -> null
      is JSONObject -> value.toMap()
      is JSONArray -> (0 until value.length()).map { jsonValueToKotlin(value.get(it)) }
      else -> value
    }

    // Custom selection action mode callback for adding custom action buttons
    val customSelectionActionModeCallback: ActionMode.Callback2 by lazy {
        SelectionActionModeCallback()
    }

    private fun ensureUserPreferencesInitialized() {
      if (this::userPreferences.isInitialized) return
      userPreferences = pendingPreferences ?: EpubPreferences()
    }

    private fun applyPendingPreferencesIfNeeded() {
      if (!this::navigator.isInitialized) return
      pendingPreferences?.let { updatePreferences(it) }
    }

    fun initFactory(
      publication: Publication,
      initialLocation: Locator?
    ) {
      factory = ReaderViewModel.Factory(
        publication,
        initialLocation
      )
      navigatorFactory = EpubNavigatorFactory(publication)
    }

    fun updatePreferences(epubPreferences: EpubPreferences) {
      userPreferences = epubPreferences

      if (this::navigator.isInitialized && navigator is EpubNavigatorFragment) {
        (navigator as EpubNavigatorFragment).submitPreferences(userPreferences)
        pendingPreferences = null
      } else {
        pendingPreferences = epubPreferences
      }
    }

    fun updateSelectionActions(actions: List<SelectionAction>) {
      selectionActions = actions
    }

    fun updateSelectionMenu(menu: SelectionMenuRecord?) {
      selectionMenu = menu
      view?.post { syncSelectionMenu() }
    }

    fun updateCustomSelectionMenu(enabled: Boolean) {
      customSelectionMenu = enabled
      view?.post { syncSelectionMenu() }
    }

    fun updateFontFamilyDeclarations(declarations: List<FontFamilyDeclarationRecord>) {
      fontFamilyDeclarations = declarations
    }

    override fun onCreate(savedInstanceState: Bundle?) {
      check(::navigatorFactory.isInitialized) { "EpubReaderFragment factory was not initialized" }

        ViewModelProvider(this, factory)
          .get(ReaderViewModel::class.java)
          .let {
            model = it
          }

          ensureUserPreferencesInitialized()

          childFragmentManager.fragmentFactory =
            navigatorFactory.createFragmentFactory(
              initialLocator = model.initialLocation,
              initialPreferences = userPreferences,
              configuration = EpubNavigatorFragment.Configuration {
                decorationTemplates = readerDecorationTemplates()
                val assetPatterns = fontFamilyDeclarations
                  .flatMap { it.fontFaces.orEmpty() }
                  .mapNotNull { servedAssetPattern(it.source) }
                  .distinct()
                servedAssets = servedAssets + assetPatterns

                fontFamilyDeclarations.forEach { declaration ->
                  val family = declaration.fontFamily.trim()
                  if (family.isEmpty()) return@forEach
                  addFontFamilyDeclaration(
                    FontFamily(family),
                    declaration.alternates.orEmpty().map { FontFamily(it) }
                  ) {
                    declaration.fontFaces.orEmpty().forEach { face ->
                      addFontFace {
                        addSource(face.source, face.preload == true)
                        fontStyleFor(face)?.let { setFontStyle(it) }
                        fontWeightFor(face)?.let { setFontWeight(it) }
                      }
                    }
                  }
                }

                if (customSelectionMenu || selectionActions.isNotEmpty()) {
                  selectionActionModeCallback = customSelectionActionModeCallback
                }
              }
            )

        setHasOptionsMenu(true)

        super.onCreate(savedInstanceState)
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        val view = super.onCreateView(inflater, container, savedInstanceState)
        val navigatorFragmentTag = getString(R.string.epub_navigator_tag)

        if (savedInstanceState == null) {
            childFragmentManager.commitNow {
                add(R.id.fragment_reader_container, EpubNavigatorFragment::class.java, Bundle(), navigatorFragmentTag)
            }
        }
        navigator = childFragmentManager.findFragmentByTag(navigatorFragmentTag) as Navigator
        navigatorFragment = navigator as EpubNavigatorFragment

        applyPendingPreferencesIfNeeded()
        view?.post { syncSelectionMenu() }

        return view
    }

    override fun onResume() {
        super.onResume()
        val activity = requireActivity()

        ensureUserPreferencesInitialized()
        applyPendingPreferencesIfNeeded()

        // If TalkBack or any touch exploration service is activated we force scroll mode (and
        // override user preferences)
        val am = activity.getSystemService(AppCompatActivity.ACCESSIBILITY_SERVICE) as AccessibilityManager
        isExploreByTouchEnabled = am.isTouchExplorationEnabled

        userPreferences = if (isExploreByTouchEnabled) {
            userPreferences.plus(EpubPreferences(scroll = true))
        } else {
            userPreferences.plus(EpubPreferences(scroll = null))
        }
        (navigator as? EpubNavigatorFragment)?.submitPreferences(userPreferences)
    }

    override fun onDestroyView() {
        dismissSelectionPopup()
        super.onDestroyView()
    }

    private fun syncSelectionMenu() {
      if (!customSelectionMenu || !this::navigator.isInitialized) {
        dismissSelectionPopup()
        return
      }

      val configuredMenu = selectionMenu
      if (configuredMenu == null) {
        dismissSelectionPopup()
        return
      }

      if (selectionPopup?.isShowing == true && shownSelectionMenu == configuredMenu) {
        return
      }

      val publicationView = (navigator as? VisualNavigator)?.publicationView ?: return
      showSelectionPopup(publicationView, configuredMenu)
    }

    private inner class SelectionActionModeCallback : ActionMode.Callback2() {
        // Store action IDs mapped to their menu item IDs for lookup
        private val actionIdMap = mutableMapOf<Int, String>()

        override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
            actionIdMap.clear()

            if (customSelectionMenu) {
                menu.clear()
                selectionMenu = null
                dismissSelectionPopup()
                val requestGeneration = ++selectionRequestGeneration
                lifecycleScope.launch {
                    val selection = currentSelectionWithVisibleResource()
                    if (requestGeneration != selectionRequestGeneration) return@launch
                    channel.send(
                        ReaderViewModel.Event.SelectionChanged(
                            locator = selection?.locator,
                            selectedText = selection?.locator?.text?.highlight,
                            rect = selection?.rect
                        )
                    )
                }
                // Keep the empty ActionMode alive so Android continues to own and display the
                // native selection handles while the app renders its configured action menu.
                return true
            }

            // Only add menu items if navigator supports decorations
            if (navigator !is DecorableNavigator) {
                return true
            }

            // Dynamically add menu items for each configured action
            selectionActions.forEachIndexed { index, action ->
                // Generate a unique menu item ID using the action's hash
                val menuItemId = action.id.hashCode()
                actionIdMap[menuItemId] = action.id

                // Add menu item with the action's label
                menu.add(Menu.NONE, menuItemId, index, action.label).apply {
                    // Show as action button if there's space
                    setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM)
                    // Use star icon for highlight action, otherwise use default
                    if (action.id == "highlight") {
                        setIcon(android.R.drawable.btn_star_big_on)
                    }
                }
            }

            return true
        }

        override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean {
            return false
        }

        override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean {
            val actionId = actionIdMap[item.itemId]
            if (actionId != null) {
                lifecycleScope.launch {
                    val selection = currentSelectionWithVisibleResource()
                    if (selection == null) return@launch
                    channel.send(
                        ReaderViewModel.Event.SelectionAction(
                            actionId = actionId,
                            locator = selection.locator,
                            selectedText = selection.locator.text.highlight ?: ""
                        )
                    )
                }

                (navigator as? SelectableNavigator)?.clearSelection()
                mode.finish()
                return true
            }
            return false
        }

        override fun onDestroyActionMode(mode: ActionMode) {
            actionIdMap.clear()
        }
    }

    @OptIn(ExperimentalReadiumApi::class)
    private suspend fun currentSelectionWithVisibleResource(): Selection? {
      val selection = (navigator as? SelectableNavigator)?.currentSelection() ?: return null
      val visibleLocator = (navigator as? VisualNavigator)?.firstVisibleElementLocator()
        ?: return selection

      return selection.copy(
        locator = selection.locator.copy(
          href = visibleLocator.href,
          mediaType = visibleLocator.mediaType,
          title = visibleLocator.title ?: selection.locator.title
        )
      )
    }

    private fun showSelectionPopup(
      anchor: View,
      configuredMenu: SelectionMenuRecord,
      colorsOnly: Boolean = false
    ) {
      dismissSelectionPopup()
      if (!anchor.isAttachedToWindow) return

      val content = createSelectionPopupContent(anchor, configuredMenu, colorsOnly)
      val visibleFrame = Rect().also(anchor::getWindowVisibleDisplayFrame)
      val margin = dp(12)
      val maxWidth = (visibleFrame.width() - margin * 2).coerceAtLeast(dp(240))
      content.measure(
        View.MeasureSpec.makeMeasureSpec(maxWidth, View.MeasureSpec.AT_MOST),
        View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
      )
      val popupWidth = content.measuredWidth.coerceAtMost(maxWidth)
      val popupHeight = content.measuredHeight
      val popup = PopupWindow(
        content,
        popupWidth,
        ViewGroup.LayoutParams.WRAP_CONTENT,
        false
      ).apply {
        setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        isOutsideTouchable = true
        isClippingEnabled = true
        elevation = dp(8).toFloat()
        setOnDismissListener {
          if (selectionPopup === this) {
            selectionPopup = null
            shownSelectionMenu = null
          }
          if (ignoringPopupDismiss) return@setOnDismissListener
          selectionMenu = null
          (navigator as? SelectableNavigator)?.clearSelection()
          lifecycleScope.launch {
            channel.send(
              ReaderViewModel.Event.SelectionChanged(
                locator = null,
                selectedText = null,
                rect = null
              )
            )
          }
        }
      }

      val anchorLocation = IntArray(2).also(anchor::getLocationInWindow)
      val sourceRect = configuredMenu.rect
      val sourceLeft = anchorLocation[0] + (sourceRect?.x ?: anchor.width / 2.0).toInt()
      val sourceTop = anchorLocation[1] + (sourceRect?.y ?: anchor.height / 2.0).toInt()
      val sourceWidth = (sourceRect?.width ?: 1.0).toInt()
      val sourceHeight = (sourceRect?.height ?: 1.0).toInt()
      val desiredX = sourceLeft + sourceWidth / 2 - popupWidth / 2
      val popupX = desiredX.coerceIn(
        visibleFrame.left + margin,
        (visibleFrame.right - popupWidth - margin).coerceAtLeast(visibleFrame.left + margin)
      )
      val aboveY = sourceTop - popupHeight - margin
      val belowY = sourceTop + sourceHeight + margin
      val popupY = if (aboveY >= visibleFrame.top + margin) {
        aboveY
      } else {
        belowY.coerceAtMost(visibleFrame.bottom - popupHeight - margin)
      }

      selectionPopup = popup
      shownSelectionMenu = configuredMenu
      popup.showAtLocation(anchor.rootView, Gravity.TOP or Gravity.START, popupX, popupY)
    }

    private fun createSelectionPopupContent(
      anchor: View,
      configuredMenu: SelectionMenuRecord,
      colorsOnly: Boolean
    ): View {
      val context = anchor.context
      val onSurface = themedColor(
        android.R.attr.textColorPrimary,
        Color.rgb(38, 38, 38)
      )
      val surface = themedColor(
        android.R.attr.colorBackground,
        Color.WHITE
      )
      val error = themedColor(
        android.R.attr.colorError,
        Color.rgb(186, 26, 26)
      )
      val row = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(8), dp(4), dp(8), dp(4))
      }

      fun addTextAction(
        label: String,
        destructive: Boolean = false,
        onClick: () -> Unit
      ) {
        row.addView(
          TextView(context).apply {
            layoutParams = LinearLayout.LayoutParams(
              ViewGroup.LayoutParams.WRAP_CONTENT,
              dp(44)
            )
            gravity = Gravity.CENTER
            minWidth = dp(48)
            setPadding(dp(12), 0, dp(12), 0)
            text = label
            textSize = 16f
            setTextColor(if (destructive) error else onSurface)
            background = selectableItemBackground(android.R.attr.selectableItemBackground)
            contentDescription = label
            isFocusable = true
            setOnClickListener { onClick() }
          }
        )
      }

      if (colorsOnly) {
        configuredMenu.colors.forEach { color ->
          row.addView(
            ImageButton(context).apply {
              layoutParams = LinearLayout.LayoutParams(dp(44), dp(44))
              setPadding(dp(10), dp(10), dp(10), dp(10))
              setImageDrawable(
                colorCircleDrawable(color.color, color.selected == true, onSurface)
              )
              imageTintList = null
              background = selectableItemBackground(
                android.R.attr.selectableItemBackgroundBorderless
              )
              contentDescription = color.label
              isFocusable = true
              setOnClickListener { handleConfiguredSelectionAction(color.id) }
            }
          )
        }
      } else {
        addTextAction(configuredMenu.colorMenuLabel) {
          showSelectionPopup(anchor, configuredMenu, colorsOnly = true)
        }
        configuredMenu.actions.forEach { action ->
          addTextAction(action.label, action.destructive == true) {
            handleConfiguredSelectionAction(action.id)
          }
        }
      }

      return HorizontalScrollView(context).apply {
        isHorizontalScrollBarEnabled = false
        overScrollMode = View.OVER_SCROLL_NEVER
        clipToOutline = true
        background = GradientDrawable().apply {
          shape = GradientDrawable.RECTANGLE
          cornerRadius = dp(26).toFloat()
          setColor(surface)
        }
        addView(row)
      }
    }

    private fun handleConfiguredSelectionAction(actionId: String) {
      val configuredMenu = selectionMenu ?: return
      dismissSelectionPopup()
      selectionMenu = null
      lifecycleScope.launch {
        val currentSelection = currentSelectionWithVisibleResource()
        val locator = currentSelection?.locator
          ?: configuredMenu.locator?.let { locatorRecordToReadium(it) }
          ?: return@launch
        val selectedText = currentSelection?.locator?.text?.highlight
          ?: configuredMenu.selectedText
        (navigator as? SelectableNavigator)?.clearSelection()
        channel.send(
          ReaderViewModel.Event.SelectionAction(
            actionId = actionId,
            locator = locator,
            selectedText = selectedText
          )
        )
      }
    }

    private fun dismissSelectionPopup() {
      val popup = selectionPopup ?: return
      ignoringPopupDismiss = true
      popup.dismiss()
      ignoringPopupDismiss = false
      selectionPopup = null
      shownSelectionMenu = null
    }

    private fun selectableItemBackground(attribute: Int): Drawable? {
      return requireContext()
        .obtainStyledAttributes(intArrayOf(attribute))
        .let { typedArray ->
          try {
            typedArray.getDrawable(0)
          } finally {
            typedArray.recycle()
          }
        }
    }

    private fun themedColor(attribute: Int, fallback: Int): Int {
      return requireContext()
        .obtainStyledAttributes(intArrayOf(attribute))
        .let { typedArray ->
          try {
            typedArray.getColor(0, fallback)
          } finally {
            typedArray.recycle()
          }
        }
    }

    private fun colorCircleDrawable(
      colorString: String,
      selected: Boolean,
      selectedRingColor: Int
    ): Drawable? {
      val color = runCatching { Color.parseColor(colorString) }.getOrNull() ?: return null
      val size = dp(24)
      val fill = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(color)
        setSize(size, size)
      }
      if (!selected) return fill

      val ring = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(selectedRingColor)
        setSize(size, size)
      }
      return LayerDrawable(arrayOf(ring, fill)).apply {
        val inset = dp(3)
        setLayerInset(1, inset, inset, inset, inset)
      }
    }

    private fun dp(value: Int): Int =
      (value * resources.displayMetrics.density).toInt()

    private fun servedAssetPattern(source: String): String? {
      val trimmed = source.trim().trimStart('/')
      if (trimmed.isEmpty()) return null
      val slashIndex = trimmed.lastIndexOf('/')
      return if (slashIndex >= 0) {
        trimmed.substring(0, slashIndex) + "/.*"
      } else {
        trimmed
      }
    }

    private fun fontStyleFor(face: FontFaceDeclarationRecord): FontStyle? {
      return when (face.style) {
        "italic" -> FontStyle.ITALIC
        "normal" -> FontStyle.NORMAL
        else -> null
      }
    }

    private fun fontWeightFor(face: FontFaceDeclarationRecord): FontWeight? {
      return when (face.weight?.toInt()) {
        100 -> FontWeight.THIN
        200 -> FontWeight.EXTRA_LIGHT
        300 -> FontWeight.LIGHT
        400 -> FontWeight.NORMAL
        500 -> FontWeight.MEDIUM
        600 -> FontWeight.SEMI_BOLD
        700 -> FontWeight.BOLD
        800 -> FontWeight.EXTRA_BOLD
        900 -> FontWeight.BLACK
        else -> null
      }
    }

    companion object {
        fun newInstance(): EpubReaderFragment {
            return EpubReaderFragment()
        }
    }
}
