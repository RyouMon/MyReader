package com.myreader.readium.reader

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import java.io.File
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.util.Url

class ReaderImageBridge(private val onImage: (String) -> Unit) {
    @JavascriptInterface fun onImage(source: String) = onImage.invoke(source)
}

object ReaderImageExport {
    fun imageHref(publication: Publication, source: String): String? {
        val path = Uri.parse(source).path ?: return null
        return (publication.readingOrder + publication.resources).firstOrNull { link ->
            val resource = Uri.parse(link.url().toString()).path ?: return@firstOrNull false
            link.mediaType?.toString()?.startsWith("image/") == true &&
                (path == resource || path.endsWith("/" + resource.trimStart('/')))
        }?.url()?.toString()
    }

    fun installScript(view: View, script: String) {
        if (view is WebView) view.evaluateJavascript(script, null)
        if (view is ViewGroup) for (index in 0 until view.childCount) installScript(view.getChildAt(index), script)
    }

    suspend fun resource(context: Context, publication: Publication, href: String, position: Int): Map<String, Any> = withContext(Dispatchers.IO) {
        val link = (publication.readingOrder + publication.resources).firstOrNull { it.url().toString() == href }
            ?: error("Image resource unavailable")
        require(link.mediaType?.toString()?.startsWith("image/") == true)
        val url = Url(href) ?: error("Invalid image URL")
        val resource = publication.get(url) ?: error("Could not read image")
        val bytes = try { resource.read().getOrNull() ?: error("Could not read image") } finally { resource.close() }
        val page = publication.readingOrder.indexOfFirst { it.url().toString() == href }.takeIf { it >= 0 }?.plus(1) ?: position
        write(context, Uri.parse(href).lastPathSegment ?: "image", link.mediaType.toString(), bytes, page)
    }

    suspend fun page(context: Context, view: View, pdfPath: String?, pageIndex: Int, column: Int = 0, columns: Int = 1): Map<String, Any> {
        val bitmap = withContext(Dispatchers.Main) {
            require(view.width > 0 && view.height > 0)
            if (pdfPath == null) {
                val left = view.width * column / columns
                val width = view.width * (column + 1) / columns - left
                Bitmap.createBitmap(width, view.height, Bitmap.Config.ARGB_8888).also {
                    val canvas = Canvas(it)
                    canvas.translate(-left.toFloat(), 0f)
                    view.draw(canvas)
                }
            } else null
        } ?: withContext(Dispatchers.IO) {
            val path = if (pdfPath!!.startsWith("file:")) Uri.parse(pdfPath).path!! else pdfPath
            ParcelFileDescriptor.open(File(path), ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
                PdfRenderer(descriptor).use { document ->
                    document.openPage(pageIndex.coerceIn(0, document.pageCount - 1)).use { page ->
                        val scale = maxOf(1f, minOf(3f, view.width.toFloat() / page.width))
                        Bitmap.createBitmap((page.width * scale).toInt(), (page.height * scale).toInt(), Bitmap.Config.ARGB_8888).also {
                            it.eraseColor(Color.WHITE)
                            page.render(it, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        }
                    }
                }
            }
        }
        return withContext(Dispatchers.IO) {
            try {
                val bytes = java.io.ByteArrayOutputStream().use { output ->
                    check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output))
                    output.toByteArray()
                }
                write(context, "page.png", "image/png", bytes, pageIndex + 1)
            } finally { bitmap.recycle() }
        }
    }

    private fun write(context: Context, name: String, mime: String, bytes: ByteArray, position: Int): Map<String, Any> {
        val root = File(context.cacheDir, "reader-images").apply { mkdirs() }
        root.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 86_400_000 }?.forEach { it.deleteRecursively() }
        val folder = File(root, UUID.randomUUID().toString()).apply { mkdirs() }
        val file = File(folder, File(name).name)
        file.writeBytes(bytes)
        return mapOf("uri" to Uri.fromFile(file).toString(), "name" to file.name, "mimeType" to mime, "position" to position)
    }
}
