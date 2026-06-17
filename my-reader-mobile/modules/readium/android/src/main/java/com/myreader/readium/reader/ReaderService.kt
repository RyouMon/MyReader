package com.myreader.readium.reader

import android.content.Context
import android.util.Log
import com.myreader.readium.Streamer.StreamerConfig
import com.myreader.readium.utils.LinkOrLocator
import java.io.File
import java.util.Locale
import org.readium.adapter.pdfium.document.PdfiumDocumentFactory
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.util.FileExtension
import org.readium.r2.shared.util.asset.AssetRetriever
import org.readium.r2.shared.util.format.FormatHints
import org.readium.r2.shared.util.http.DefaultHttpClient
import org.readium.r2.shared.util.toUrl
import org.readium.r2.streamer.PublicationOpener
import org.readium.r2.streamer.parser.DefaultPublicationParser

class ReaderService(
  private val context: Context,
  config: StreamerConfig = StreamerConfig,
) {
  private val httpClient = DefaultHttpClient()
  private val assetRetriever = AssetRetriever(
    context.contentResolver,
    httpClient
  )
  private val publicationOpener = PublicationOpener(
    publicationParser = DefaultPublicationParser(
      context = context,
      assetRetriever = assetRetriever,
      httpClient = httpClient,
      pdfFactory = PdfiumDocumentFactory(context),
    ),
    // REP-005/006: content protections (LCP/DRM) and onCreatePublication
    // transforms (CSS/JS injection, manifest mutation) are plumbed through
    // here so Phase 2 can wire them from StreamerConfig without touching the
    // opener construction. Phase 1 leaves both empty.
    contentProtections = config.contentProtections,
    onCreatePublication = { /* REP-005: reserved for Phase 2 */ }
  )

  fun locatorFromLinkOrLocator(
    location: LinkOrLocator?,
    publication: Publication,
  ): Locator? {

    if (location == null) return null

    when (location) {
      is LinkOrLocator.Link -> {
        return publication.locatorFromLink(location.link)
      }
      is LinkOrLocator.Locator -> {
        return location.locator
      }
    }

    return null
  }

  suspend fun openPublication(
    fileName: String,
    initialLocation: LinkOrLocator?,
    callback: suspend (fragment: BaseReaderFragment) -> Unit
  ) {
    val publicationFile = File(fileName).absoluteFile
    if (!publicationFile.exists()) {
      Log.e(TAG, "Failed to open publication: File does not exist: $fileName")
      return
    }
    val publicationUrl = runCatching {
      publicationFile.toUrl()
    }
      .onFailure {
        Log.e(TAG, "Invalid publication path: $fileName - ${it.message}")
      }
      .getOrNull()
      ?: return

    val fileExtension = publicationFile.extension
      .takeIf { it.isNotEmpty() }?.lowercase(Locale.ROOT)

    val asset = assetRetriever
      .retrieve(
        publicationUrl,
        FormatHints(fileExtension = fileExtension?.let { FileExtension(it) })
      )
      .onFailure {
        Log.w(TAG, "Unable to retrieve publication asset: ${it.message}")
      }
      .getOrNull()
      ?: return

    publicationOpener
      .open(
        asset = asset,
        allowUserInteraction = false
      )
      .onSuccess { publication ->
        val locator = locatorFromLinkOrLocator(initialLocation, publication)
        @OptIn(ExperimentalReadiumApi::class)
        val readerFragment: BaseReaderFragment = when {
          publication.conformsTo(Publication.Profile.DIVINA) -> {
            ImageReaderFragment.newInstance().also { it.initFactory(publication, locator) }
          }
          publication.conformsTo(Publication.Profile.PDF) -> {
            PdfReaderFragment.newInstance().also { it.initFactory(publication, locator) }
          }
          else -> {
            EpubReaderFragment.newInstance().also { it.initFactory(publication, locator) }
          }
        }
        callback.invoke(readerFragment)
      }
      .onFailure {
        Log.w(TAG, "Error executing ReaderService.openPublication: ${it.message}")
        // TODO: implement failure event
      }
  }

  sealed class Event {

    class ImportPublicationFailed(val errorMessage: String?) : Event()

    object UnableToMovePublication : Event()

    object ImportPublicationSuccess : Event()

    object ImportDatabaseFailed : Event()

    class OpenBookError(val errorMessage: String?) : Event()
  }

  companion object {
    private const val TAG = "ReaderService"
  }
}
