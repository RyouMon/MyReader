package com.myreader.readium.reader

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.fragment.app.commitNow
import androidx.lifecycle.lifecycleScope
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
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

@RunWith(AndroidJUnit4::class)
class ReaderEpubImageExportTest {
    @Test fun loaded_epub_installs_long_press_and_exports_only_the_selected_original() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val bitmap = Bitmap.createBitmap(60, 90, Bitmap.Config.ARGB_8888)
        val original = try {
            bitmap.eraseColor(android.graphics.Color.RED)
            ByteArrayOutputStream().use { output ->
                check(bitmap.compress(Bitmap.CompressFormat.JPEG, 90, output))
                output.toByteArray()
            }
        } finally { bitmap.recycle() }
        val archive = File.createTempFile("reader-epub-images", ".epub", context.cacheDir)
        val files = mapOf(
            "mimetype" to "application/epub+zip".toByteArray(),
            "META-INF/container.xml" to """<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>""".toByteArray(),
            "book.opf" to """<?xml version="1.0"?><package version="3.0" unique-identifier="id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">reader-export</dc:identifier><dc:title>Export fixture</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="image" href="original.jpg" media-type="image/jpeg"/></manifest><spine><itemref idref="chapter"/></spine></package>""".toByteArray(),
            "chapter.xhtml" to """<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Export</title></head><body><img id="original" src="original.jpg" alt="Selected original"/></body></html>""".toByteArray(),
            "original.jpg" to original,
        )
        ZipOutputStream(archive.outputStream()).use { zip ->
            for ((name, bytes) in files) {
                zip.putNextEntry(ZipEntry(name))
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
                            ReaderService(activity).openPublication(archive.path, null) { reader ->
                                activity.supportFragmentManager.commitNow { add(activity.container.id, reader) }
                                ready.complete(reader)
                            }
                        } catch (error: Throwable) { ready.completeExceptionally(error) }
                    }
                }
                val reader = withTimeout(15_000) { ready.await() }
                try {
                    assertTrue(reader is EpubReaderFragment)
                    val selected = CompletableDeferred<String>()
                    val selections = mutableListOf<String>()
                    withContext(Dispatchers.Main) {
                        reader.onImagePress = { selections.add(it); selected.complete(it) }
                    }
                    val web = withTimeout(15_000) {
                        var loaded: WebView? = null
                        while (loaded == null) {
                            val candidate = withContext(Dispatchers.Main) { findWebView(reader.requireView()) }
                            if (candidate != null && evaluate(candidate, "Boolean(window.__readerImageActions && document.getElementById('original')?.complete)") == "true") loaded = candidate
                            else delay(50)
                        }
                        loaded
                    }
                    evaluate(web, """
                        ReaderImage.onImage('https://reader.test/foreign.jpg');
                        ReaderImage.onImage(location.href);
                        document.getElementById('original').dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, isPrimary: true, button: 0}));
                        true;
                    """.trimIndent())
                    val href = withTimeout(5_000) { selected.await() }
                    assertEquals("original.jpg", href)
                    assertEquals(listOf("original.jpg"), withContext(Dispatchers.Main) { selections.toList() })
                    val exported = ReaderImageExport.resource(context, reader.publication, href, 7)
                    assertEquals(7, exported["position"])
                    assertEquals("image/jpeg", exported["mimeType"])
                    assertArrayEquals(original, File(Uri.parse(exported["uri"] as String).path!!).readBytes())
                } finally { reader.publication.close() }
            }
        } finally { archive.delete() }
    }

    private fun findWebView(view: View): WebView? {
        if (view is WebView && view.getGlobalVisibleRect(android.graphics.Rect())) return view
        if (view is ViewGroup) for (index in 0 until view.childCount) findWebView(view.getChildAt(index))?.let { return it }
        return null
    }

    private suspend fun evaluate(view: WebView, script: String): String = withContext(Dispatchers.Main) {
        val result = CompletableDeferred<String>()
        view.evaluateJavascript(script) { result.complete(it) }
        result.await()
    }
}
