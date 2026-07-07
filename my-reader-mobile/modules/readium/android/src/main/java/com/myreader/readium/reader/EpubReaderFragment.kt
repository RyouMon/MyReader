/*
 * Copyright 2021 Readium Foundation. All rights reserved.
 * Use of this source code is governed by the BSD-style license
 * available in the top-level LICENSE file of the project.
 */

package com.myreader.readium.reader

import android.os.Bundle
import android.view.*
import android.view.accessibility.AccessibilityManager
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.commitNow
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.myreader.readium.R
import com.myreader.readium.Types.FontFamilyDeclarationRecord
import com.myreader.readium.Types.FontFaceDeclarationRecord
import kotlinx.coroutines.launch
import org.readium.r2.navigator.DecorableNavigator
import org.readium.r2.navigator.SelectableNavigator
import org.readium.r2.navigator.epub.EpubNavigatorFragment
import org.readium.r2.navigator.Navigator
import org.readium.r2.navigator.epub.EpubPreferences
import org.readium.r2.navigator.epub.EpubNavigatorFactory
import org.readium.r2.navigator.epub.css.FontStyle
import org.readium.r2.navigator.epub.css.FontWeight
import org.readium.r2.navigator.preferences.FontFamily
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Publication

data class SelectionAction(
    val id: String,
    val label: String
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
    private var fontFamilyDeclarations: List<FontFamilyDeclarationRecord> = emptyList()

    // Custom selection action mode callback for adding custom action buttons
    val customSelectionActionModeCallback: ActionMode.Callback by lazy {
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

                if (selectionActions.isNotEmpty()) {
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

    private inner class SelectionActionModeCallback : ActionMode.Callback {
        // Store action IDs mapped to their menu item IDs for lookup
        private val actionIdMap = mutableMapOf<Int, String>()

        override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
            // Clear previous action mappings
            actionIdMap.clear()

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
                // Get the current selection from the navigator
                lifecycleScope.launch {
                    val selectableNavigator = navigator as? SelectableNavigator
                    val selection = selectableNavigator?.currentSelection()

                    if (selection != null) {
                        // Emit generic SelectionAction event to React Native
                        channel.send(
                            ReaderViewModel.Event.SelectionAction(
                                actionId = actionId,
                                locator = selection.locator,
                                selectedText = selection.locator.text.highlight ?: ""
                            )
                        )
                    }
                }

                mode.finish()
                return true
            }
            return false
        }

        override fun onDestroyActionMode(mode: ActionMode) {
            // Clean up action mappings
            actionIdMap.clear()
        }
    }

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
