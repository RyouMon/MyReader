package com.myreader.readium

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.fragment.app.FragmentActivity
import com.myreader.readium.reader.BaseReaderFragment
import com.myreader.readium.reader.ReaderViewModel
import expo.modules.kotlin.AppContext
import io.mockk.every
import io.mockk.mockk
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test
import org.junit.runner.RunWith
import org.readium.r2.navigator.Navigator
import org.readium.r2.shared.publication.Manifest
import org.readium.r2.shared.publication.Metadata
import org.readium.r2.shared.publication.Publication
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ReadiumViewMountTest {
  @Test
  fun mounts_directly_in_its_host_when_a_react_view_uses_the_same_id() {
    Robolectric.buildActivity(FragmentActivity::class.java).setup().visible().use { controller ->
      val activity = controller.get()
      val appContext = mockk<AppContext>(relaxed = true)
      every { appContext.hasActiveReactInstance } returns false
      val reader = ReadiumView(activity, appContext)
      val host = reader.getChildAt(0) as ViewGroup
      val root = FrameLayout(activity)
      // React Native allocates IDs independently of View.generateViewId().
      val unrelated = FrameLayout(activity).apply { id = View.generateViewId() + 1 }
      root.addView(unrelated)
      root.addView(reader)
      activity.setContentView(root)

      val fragment = MountTrackingFragment()
      try {
        ReadiumView::class.java.getDeclaredMethod("addFragment", BaseReaderFragment::class.java)
          .apply { isAccessible = true }.invoke(reader, fragment)

        assertSame(host, fragment.requireView().parent)
        assertEquals("Mounting must not attach to another view and recycle the navigator", listOf(host), fragment.attachedParents)
        assertEquals(0, fragment.detachCount)
        assertEquals(0, unrelated.childCount)
      } finally {
        reader.cleanup()
      }
    }
  }
}

class MountTrackingFragment : BaseReaderFragment() {
  override val model = ReaderViewModel(Publication(Manifest(metadata = Metadata())), null)
  override val navigator: Navigator = mockk(relaxed = true)
  val attachedParents = mutableListOf<ViewGroup>()
  var detachCount = 0

  override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View =
    object : View(inflater.context) {
      override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        attachedParents.add(parent as ViewGroup)
      }

      override fun onDetachedFromWindow() {
        detachCount++
        super.onDetachedFromWindow()
      }
    }

  override fun onViewCreated(view: View, savedInstanceState: Bundle?) = Unit
}
