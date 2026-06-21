package com.myreader.readium.reader

import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.commitNow
import androidx.lifecycle.ViewModelProvider
import androidx.viewpager.widget.ViewPager
import com.myreader.readium.R
import org.readium.r2.navigator.Navigator
import org.readium.r2.navigator.image.ImageNavigatorFragment
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Publication

private const val TAG = "ImageReaderFragment"

@OptIn(ExperimentalReadiumApi::class)
class ImageReaderFragment : VisualReaderFragment(), ImageNavigatorFragment.Listener {

    override lateinit var model: ReaderViewModel
    override lateinit var navigator: Navigator

    private lateinit var factory: ReaderViewModel.Factory
    private lateinit var navigatorFactory: androidx.fragment.app.FragmentFactory
    private var pendingReadingProgression: String? = null

    override fun shouldReverseEdgeNavigation(): Boolean =
        pendingReadingProgression == "rtl"

    fun initFactory(publication: Publication, initialLocation: Locator?) {
        factory = ReaderViewModel.Factory(publication, initialLocation)
        navigatorFactory = ImageNavigatorFragment.createFactory(
            publication = publication,
            initialLocator = initialLocation,
            listener = this
        )
    }

    override fun applyReadingProgression(readingProgression: String?) {
        pendingReadingProgression = readingProgression
        applyPendingReadingProgression()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        check(::factory.isInitialized) { "ImageReaderFragment factory was not initialized" }
        ViewModelProvider(this, factory)
            .get(ReaderViewModel::class.java)
            .let { model = it }
        childFragmentManager.fragmentFactory = navigatorFactory
        super.onCreate(savedInstanceState)
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = super.onCreateView(inflater, container, savedInstanceState)
        val tag = getString(R.string.image_navigator_tag)
        if (savedInstanceState == null) {
            childFragmentManager.commitNow {
                add(R.id.fragment_reader_container, ImageNavigatorFragment::class.java, Bundle(), tag)
            }
        }
        navigator = childFragmentManager.findFragmentByTag(tag) as Navigator
        applyPendingReadingProgression()
        return view
    }

    /**
     * The Readium ImageNavigatorFragment does not expose a runtime reading-progression
     * preference. It does use an internal R2RTLViewPager whose public `direction` field
     * controls page ordering and swipe direction. We reach it through reflection because
     * R2ViewPager/R2RTLViewPager are package-internal classes.
     */
    private fun applyPendingReadingProgression() {
        val view = view ?: return
        val pager = findR2ViewPager(view) ?: return
        val rtl = pendingReadingProgression == "rtl"

        try {
            val directionField = pager.javaClass.getField("direction")
            directionField.isAccessible = true

            val readingProgressionClass = Class.forName("org.readium.r2.navigator.preferences.ReadingProgression")
            val targetValue = readingProgressionClass.getField(if (rtl) "RTL" else "LTR").get(null)

            if (directionField.get(pager) != targetValue) {
                directionField.set(pager, targetValue)
                pager.layoutDirection = if (rtl) View.LAYOUT_DIRECTION_RTL else View.LAYOUT_DIRECTION_LTR
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to apply reading progression to ImageNavigatorFragment: ${e.message}")
        }
    }

    private fun findR2ViewPager(root: View?): View? {
        if (root == null) return null
        if (root.javaClass.name.contains("R2ViewPager")) return root
        if (root is ViewGroup) {
            for (i in 0 until root.childCount) {
                findR2ViewPager(root.getChildAt(i))?.let { return it }
            }
        }
        return null
    }

    companion object {
        fun newInstance() = ImageReaderFragment()
    }
}
