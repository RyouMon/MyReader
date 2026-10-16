@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class, org.readium.r2.shared.InternalReadiumApi::class)

package com.myreader.readium.reader

import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import android.view.View
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.fragment.app.Fragment
import com.myreader.readium.ReadiumView
import com.myreader.readium.Types.PreferencesRecord
import expo.modules.kotlin.AppContext
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.readium.r2.shared.publication.Link
import org.readium.r2.shared.publication.Manifest
import org.readium.r2.shared.publication.Metadata
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.Locator
import org.readium.r2.navigator.Navigator
import org.readium.r2.navigator.epub.EpubNavigatorFragment
import org.readium.r2.shared.publication.services.PositionsService
import org.readium.r2.shared.publication.services.positionsServiceFactory
import org.readium.r2.shared.util.Try
import org.readium.r2.shared.util.Url
import org.readium.r2.shared.util.data.Container
import org.readium.r2.shared.util.mediatype.MediaType
import org.readium.r2.shared.util.resource.Resource
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ReaderImageExportTest {
    private val context = RuntimeEnvironment.getApplication()
    private val original = byteArrayOf(0xff.toByte(), 0xd8.toByte(), 0, 0xfe.toByte(), 0xff.toByte(), 0xd9.toByte())
    private var closed = false
    private val resource = object : Resource {
        override val sourceUrl = null
        override suspend fun properties() = Try.success(Resource.Properties())
        override suspend fun length() = Try.success(original.size.toLong())
        override suspend fun read(range: LongRange?) = Try.success(original)
        override fun close() { closed = true }
    }
    private val images = listOf("images/1.jpg", "images/2.jpg").map { Link(href = Url(it)!!, mediaType = MediaType.JPEG) }
    private val publication = Publication(
        manifest = Manifest(metadata = Metadata(), readingOrder = images,
            resources = listOf(Link(href = Url("cover.jpg")!!, mediaType = MediaType.JPEG), Link(href = Url("chapter.xhtml")!!, mediaType = MediaType.XHTML))),
        container = object : Container<Resource> {
            override val entries = (images.map { it.url() } + Url("cover.jpg")!!).toSet()
            override fun get(url: Url) = if (url in entries) resource else null
            override fun close() {}
        },
    )

    @Before fun setUp() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun tearDown() { Dispatchers.resetMain() }

    @Test fun original_bytes_format_position_and_resource_lifetime_are_preserved() = runBlocking {
        val first = ReaderImageExport.resource(context, publication, "images/2.jpg", 99)
        val second = ReaderImageExport.resource(context, publication, "images/2.jpg", 99)
        assertArrayEquals(original, file(first).readBytes())
        assertTrue(closed)
        assertEquals("image/jpeg", first["mimeType"])
        assertEquals(2, first["position"])
        assertNotEquals(first["uri"], second["uri"])
        assertEquals(7, ReaderImageExport.resource(context, publication, "cover.jpg", 7)["position"])
    }

    @Test fun only_publication_images_can_be_selected_or_exported() = runBlocking {
        assertEquals("images/2.jpg", ReaderImageExport.imageHref(publication, "https://reader.test/book/images/2.jpg"))
        assertNull(ReaderImageExport.imageHref(publication, "https://reader.test/book/chapter.xhtml"))
        assertNull(ReaderImageExport.imageHref(publication, "https://reader.test/missing.jpg"))
        for (href in listOf("missing.jpg", "chapter.xhtml")) {
            val error = runCatching { ReaderImageExport.resource(context, publication, href, 1) }.exceptionOrNull()
            assertNotNull(error)
        }
    }

    @Test fun expired_cache_is_removed_but_recent_exports_remain_readable() = runBlocking {
        val old = file(ReaderImageExport.resource(context, publication, "images/1.jpg", 1))
        old.parentFile!!.setLastModified(System.currentTimeMillis() - 90_000_000)
        val recent = file(ReaderImageExport.resource(context, publication, "images/2.jpg", 2))
        assertFalse(old.exists())
        assertArrayEquals(original, recent.readBytes())
    }

    @Test fun epub_columns_render_distinct_pixels_and_keep_their_page_numbers() = runBlocking {
        val view = object : View(context) {
            override fun onDraw(canvas: Canvas) {
                canvas.drawRect(0f, 0f, 100f, 100f, Paint().apply { color = Color.RED })
                canvas.drawRect(100f, 0f, 200f, 100f, Paint().apply { color = Color.BLUE })
            }
        }.apply { layout(0, 0, 200, 100) }
        for ((column, color) in listOf(Color.RED, Color.BLUE).withIndex()) {
            val result = ReaderImageExport.page(context, view, null, 3 + column, column, 2)
            val bitmap = BitmapFactory.decodeFile(file(result).path)
            assertEquals(100, bitmap.width)
            assertEquals(100, bitmap.height)
            assertEquals(color, bitmap.getPixel(50, 50))
            assertEquals(4 + column, result["position"])
            assertEquals("image/png", result["mimeType"])
            bitmap.recycle()
        }
        val single = BitmapFactory.decodeFile(file(ReaderImageExport.page(context, view, null, 0)).path)
        assertEquals(200, single.width)
        assertEquals(Color.RED, single.getPixel(50, 50))
        assertEquals(Color.BLUE, single.getPixel(150, 50))
        single.recycle()
        assertTrue(runCatching { ReaderImageExport.page(context, View(context), null, 0) }.isFailure)
    }

    @Test fun script_reaches_nested_webviews_and_bridge_forwards_the_selected_image() {
        val webView = WebView(context)
        val root = FrameLayout(context).apply { addView(FrameLayout(context).apply { addView(webView) }) }
        ReaderImageExport.installScript(root, "window.readerImagesReady = true")
        assertEquals("window.readerImagesReady = true", shadowOf(webView).lastEvaluatedJavascript)
        var selected: String? = null
        ReaderImageBridge { selected = it }.onImage("images/2.jpg")
        assertEquals("images/2.jpg", selected)
    }

    @Test fun cbz_bridge_exports_the_current_original_or_the_explicitly_selected_image() = runBlocking {
        val fragment = ImageReaderFragment().apply {
            setNavigator(this, this@ReaderImageExportTest.publication, mockk<Navigator>().also {
                every { it.currentLocator } returns MutableStateFlow(Locator(Url("images/2.jpg")!!, MediaType.JPEG, locations = Locator.Locations(position = 2)))
            })
        }
        val reader = reader(fragment)
        val current = reader.exportImages(null)
        assertEquals(1, current.size)
        assertEquals(2, current.single()["position"])
        assertArrayEquals(original, file(current.single()).readBytes())
        val selected = reader.exportImages("images/1.jpg")
        assertEquals(1, selected.single()["position"])
        assertArrayEquals(original, file(selected.single()).readBytes())
        assertTrue(runCatching { reader(null).exportImages(null) }.isFailure)
    }

    @Test fun epub_bridge_exports_the_visible_columns_in_reading_order() = runBlocking {
        val locators = (1..5).map { Locator(Url("chapter.xhtml")!!, MediaType.XHTML,
            locations = Locator.Locations(position = it, progression = (it - 1) / 4.0)) }
        val book = Publication(manifest = Manifest(metadata = Metadata(), readingOrder = listOf(Link(Url("chapter.xhtml")!!, MediaType.XHTML))),
            servicesBuilder = Publication.ServicesBuilder().apply {
                positionsServiceFactory = { object : PositionsService {
                    override suspend fun positionsByReadingOrder() = listOf(locators)
                } }
            })
        val nav = mockk<EpubNavigatorFragment>(relaxed = true)
        every { nav.currentLocator } returns MutableStateFlow(locators[1])
        coEvery { nav.evaluateJavascript(any()) } returns "{\"columns\":2,\"step\":0.25}"
        val fragment = EpubReaderFragment().apply { setNavigator(this, book, nav); navigatorFragment = nav }
        assertEquals(listOf(2, 3), fragment.imagePagePositions())
        val canvasView = object : View(context) {
            override fun onDraw(canvas: Canvas) {
                canvas.drawRect(0f, 0f, 100f, 100f, Paint().apply { color = Color.RED })
                canvas.drawRect(100f, 0f, 200f, 100f, Paint().apply { color = Color.BLUE })
            }
        }.apply { layout(0, 0, 200, 100) }
        Fragment::class.java.getDeclaredField("mView").apply { isAccessible = true }.set(fragment, canvasView)
        for (rtl in listOf(false, true)) {
            val reader = reader(fragment, rtl)
            val images = reader.exportImages(null)
            assertEquals(listOf(2, 3), images.map { it["position"] })
            val colors = images.map { image -> BitmapFactory.decodeFile(file(image).path).let {
                val color = it.getPixel(it.width / 2, it.height / 2); it.recycle(); color
            } }
            assertEquals(if (rtl) listOf(Color.BLUE, Color.RED) else listOf(Color.RED, Color.BLUE), colors)
        }
        coEvery { nav.evaluateJavascript(any()) } returns "{\"columns\":1,\"step\":0.25}"
        assertEquals(listOf(2), fragment.imagePagePositions())
        coEvery { nav.evaluateJavascript(any()) } returns null
        assertTrue(runCatching { fragment.imagePagePositions() }.isFailure)
    }

    @Test fun cbz_long_press_resolves_the_page_at_press_time_after_navigation() {
        val location = MutableStateFlow(Locator(Url("images/1.jpg")!!, MediaType.JPEG))
        val fragment = ImageReaderFragment().apply {
            setNavigator(this, this@ReaderImageExportTest.publication, mockk<Navigator>().also { every { it.currentLocator } returns location })
        }
        val image = ImageView(context)
        val root = FrameLayout(context).apply { addView(FrameLayout(context).apply { addView(image) }) }
        Fragment::class.java.getDeclaredField("mView").apply { isAccessible = true }.set(fragment, root)
        val listener = ImageReaderFragment::class.java.getDeclaredField("imageLayoutListener").apply { isAccessible = true }.get(fragment) as android.view.ViewTreeObserver.OnGlobalLayoutListener
        var selected: String? = null
        fragment.onImagePress = { selected = it }
        listener.onGlobalLayout()
        location.value = Locator(Url("images/2.jpg")!!, MediaType.JPEG)
        assertTrue(image.performLongClick())
        assertEquals("images/2.jpg", selected)
        assertFalse(root.isLongClickable)
    }

    private fun setNavigator(fragment: BaseReaderFragment, book: Publication, navigator: Navigator) {
        fragment.javaClass.getDeclaredField("model").apply { isAccessible = true }.set(fragment, ReaderViewModel(book, null))
        fragment.javaClass.getDeclaredField("navigator").apply { isAccessible = true }.set(fragment, navigator)
    }

    private fun reader(fragment: BaseReaderFragment?, rtl: Boolean = false): ReadiumView {
        val appContext = mockk<AppContext>(relaxed = true)
        every { appContext.reactContext } returns context
        return ReadiumView(context, appContext).apply {
            preferences = PreferencesRecord(readingProgression = if (rtl) "rtl" else "ltr")
            ReadiumView::class.java.getDeclaredField("fragment").apply { isAccessible = true }.set(this, fragment)
        }
    }

    private fun file(image: Map<String, Any>) = File(Uri.parse(image["uri"] as String).path!!)
}
