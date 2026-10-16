package com.myreader.readium.reader

import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.view.View
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ReaderPdfImageExportTest {
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
