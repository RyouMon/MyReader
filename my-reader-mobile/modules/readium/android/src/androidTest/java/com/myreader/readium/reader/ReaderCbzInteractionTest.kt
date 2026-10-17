package com.myreader.readium.reader

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.commitNow
import androidx.lifecycle.lifecycleScope
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.github.chrisbanes.photoview.PhotoView
import com.myreader.readium.utils.LinkOrLocator
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.util.Url
import org.readium.r2.shared.util.mediatype.MediaType

class ReaderCbzTestActivity : AppCompatActivity() {
    lateinit var container: FrameLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(androidx.appcompat.R.style.Theme_AppCompat_Light_NoActionBar)
        super.onCreate(savedInstanceState)
        container = FrameLayout(this).apply { id = View.generateViewId() }
        setContentView(container)
    }
}

@RunWith(AndroidJUnit4::class)
class ReaderCbzInteractionTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext

    @Test fun cbz_restoration_navigation_long_press_and_export_use_the_original_page() = runBlocking {
        val saved = Locator(Url("foreign/page-002.jpg")!!, MediaType.JPEG, locations = Locator.Locations(position = 2))
        withReader(LinkOrLocator.Locator(saved)) { reader, originals ->
            awaitPhoto(reader)
            assertEquals(2, withContext(Dispatchers.Main) { reader.imageLocation?.locations?.position })
            withContext(Dispatchers.Main) { assertTrue(reader.goBackward()) }
            withTimeout(10_000) {
                while (withContext(Dispatchers.Main) { reader.imageLocation?.locations?.position } != 1) delay(50)
            }
            val photo = awaitPhoto(reader)
            val selected = CompletableDeferred<String>()
            withContext(Dispatchers.Main) { reader.onImagePress = { selected.complete(it) } }
            val point = withContext(Dispatchers.Main) {
                IntArray(2).also(photo::getLocationOnScreen).let { it[0] + photo.width / 2f to it[1] + photo.height / 2f }
            }
            val down = SystemClock.uptimeMillis()
            send(MotionEvent.obtain(down, down, MotionEvent.ACTION_DOWN, point.first, point.second, 0))
            delay(800)
            send(MotionEvent.obtain(down, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, point.first, point.second, 0))
            val href = withTimeout(5_000) { selected.await() }
            assertEquals("pages/page-001.jpg", href)
            val exported = ReaderImageExport.resource(context, reader.publication, href, 99)
            assertEquals(1, exported["position"])
            assertEquals("image/jpeg", exported["mimeType"])
            assertArrayEquals(originals[0], File(Uri.parse(exported["uri"] as String).path!!).readBytes())
        }
    }

    private suspend fun withReader(
        initial: LinkOrLocator? = null,
        block: suspend (ImageReaderFragment, List<ByteArray>) -> Unit,
    ) {
        val originals = listOf(Color.RED, Color.BLUE).map { color ->
            val bitmap = Bitmap.createBitmap(600, 900, Bitmap.Config.ARGB_8888)
            try {
                bitmap.eraseColor(color)
                ByteArrayOutputStream().use { output ->
                    check(bitmap.compress(Bitmap.CompressFormat.JPEG, 90, output))
                    output.toByteArray()
                }
            } finally { bitmap.recycle() }
        }
        val archive = File.createTempFile("reader-cbz", ".cbz", context.cacheDir)
        ZipOutputStream(archive.outputStream()).use { zip ->
            originals.forEachIndexed { index, bytes ->
                zip.putNextEntry(ZipEntry("pages/page-00${index + 1}.jpg"))
                zip.write(bytes)
                zip.closeEntry()
            }
        }
        try {
            ActivityScenario.launch<ReaderCbzTestActivity>(Intent(context, ReaderCbzTestActivity::class.java)).use { scenario ->
                val ready = CompletableDeferred<BaseReaderFragment>()
                scenario.onActivity { activity ->
                    activity.lifecycleScope.launch {
                        try {
                            ReaderService(activity).openPublication(archive.path, initial) { reader ->
                                activity.supportFragmentManager.commitNow { add(activity.container.id, reader) }
                                ready.complete(reader)
                            }
                        } catch (error: Throwable) { ready.completeExceptionally(error) }
                    }
                }
                val reader = withTimeout(15_000) { ready.await() }
                try {
                    assertTrue("CBZ must open in Readium's native image navigator", reader is ImageReaderFragment)
                    block(reader as ImageReaderFragment, originals)
                } finally { reader.publication.close() }
            }
        } finally { archive.delete() }
    }

    private suspend fun awaitPhoto(reader: ImageReaderFragment): PhotoView = withTimeout(10_000) {
        while (true) {
            val photo = withContext(Dispatchers.Main) {
                fun find(view: View): PhotoView? {
                    if (view is PhotoView && view.drawable != null && view.getGlobalVisibleRect(android.graphics.Rect())) return view
                    if (view is ViewGroup) for (index in 0 until view.childCount) find(view.getChildAt(index))?.let { return it }
                    return null
                }
                find(reader.requireView())
            }
            if (photo != null) return@withTimeout photo
            delay(50)
        }
        error("CBZ image not rendered")
    }

    private fun send(event: MotionEvent) {
        try { instrumentation.sendPointerSync(event) } finally { event.recycle() }
    }
}
