package com.myreader.readium.reader

import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfDocument
import android.content.Intent
import android.net.Uri
import android.view.View
import android.view.ViewGroup
import com.github.barteksc.pdfviewer.PDFView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.core.app.ActivityScenario
import androidx.fragment.app.commitNow
import androidx.lifecycle.lifecycleScope
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ReaderPdfImageExportTest {
    @Test fun pdf_visible_export_pages_follow_actual_navigation_without_stale_pages() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val pdf = File.createTempFile("reader-visible-pages", ".pdf", context.cacheDir)
        val document = PdfDocument()
        try {
            repeat(3) { index ->
                val page = document.startPage(PdfDocument.PageInfo.Builder(100, 400, index + 1).create())
                page.canvas.drawColor(listOf(Color.RED, Color.GREEN, Color.BLUE)[index])
                document.finishPage(page)
            }
            pdf.outputStream().use(document::writeTo)
        } finally { document.close() }
        try {
            ActivityScenario.launch<ReaderCbzTestActivity>(Intent(context, ReaderCbzTestActivity::class.java)).use { scenario ->
                val ready = CompletableDeferred<BaseReaderFragment>()
                scenario.onActivity { activity ->
                    activity.lifecycleScope.launch {
                        try {
                            ReaderService(activity).openPublication(pdf.path, null) { reader ->
                                activity.supportFragmentManager.commitNow { add(activity.container.id, reader) }
                                ready.complete(reader)
                            }
                        } catch (error: Throwable) { ready.completeExceptionally(error) }
                    }
                }
                val reader = withTimeout(15_000) { ready.await() } as PdfReaderFragment
                try {
                    withTimeout(10_000) {
                        while (withContext(Dispatchers.Main) { reader.visibleImagePages } != listOf(1)) delay(50)
                    }
                    withContext(Dispatchers.Main) {
                        fun find(view: View): PDFView? {
                            if (view is PDFView) return view
                            if (view is ViewGroup) for (index in 0 until view.childCount) find(view.getChildAt(index))?.let { return it }
                            return null
                        }
                        checkNotNull(find(reader.requireView())).jumpTo(1, false)
                    }
                    withTimeout(10_000) {
                        while (withContext(Dispatchers.Main) { reader.visibleImagePages } != listOf(2)) delay(50)
                    }
                    val image = ReaderImageExport.page(context, withContext(Dispatchers.Main) { reader.requireView() }, pdf.path, 1)
                    val bitmap = BitmapFactory.decodeFile(File(Uri.parse(image["uri"] as String).path!!).path)
                    assertEquals(2, image["position"])
                    assertEquals(Color.GREEN, bitmap.getPixel(bitmap.width / 2, bitmap.height / 2))
                    bitmap.recycle()
                } finally { reader.publication.close() }
            }
        } finally { pdf.delete() }
    }

    @Test fun pdf_renders_each_visible_page_with_its_position_and_without_reader_chrome() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val pdf = File.createTempFile("reader-image", ".pdf", context.cacheDir)
        val document = PdfDocument()
        try {
            for ((index, color) in listOf(Color.RED, Color.BLUE).withIndex()) {
                val page = document.startPage(PdfDocument.PageInfo.Builder(100, 100, index + 1).create())
                page.canvas.drawColor(color)
                document.finishPage(page)
            }
            pdf.outputStream().use(document::writeTo)
        } finally { document.close() }
        val view = withContext(Dispatchers.Main) {
            View(context).apply { layout(0, 0, 200, 100); setBackgroundColor(Color.GREEN) }
        }
        try {
            val pages = listOf(pdf.path, Uri.fromFile(pdf).toString()).mapIndexed { index, path ->
                ReaderImageExport.page(context, view, path, index)
            }
            assertEquals(listOf(1, 2), pages.map { it["position"] })
            for ((index, result) in pages.withIndex()) {
                val file = File(Uri.parse(result["uri"] as String).path!!)
                val bitmap = BitmapFactory.decodeFile(file.path)
                assertEquals(listOf(Color.RED, Color.BLUE)[index], bitmap.getPixel(bitmap.width / 2, bitmap.height / 2))
                assertEquals("image/png", result["mimeType"])
                bitmap.recycle()
            }
        } finally { pdf.delete() }
    }
}
