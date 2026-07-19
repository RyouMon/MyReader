package com.myreader.readium

import com.myreader.readium.Converters.flattenReadiumLinksToMaps
import com.myreader.readium.Converters.locatorRecordToReadium
import com.myreader.readium.Converters.readiumLocatorToMap
import com.myreader.readium.Converters.readiumMetadataToMap
import com.myreader.readium.Search.SearchSessionStore
import com.myreader.readium.Streamer.PublicationStore
import com.myreader.readium.Streamer.StreamerConfig
import com.myreader.readium.Types.DecorationGroupRecord
import com.myreader.readium.Types.FontFamilyDeclarationRecord
import com.myreader.readium.Types.FormatRegistrationRecord
import com.myreader.readium.Types.LocatorRecord
import com.myreader.readium.Types.PreferencesRecord
import com.myreader.readium.Types.PublicationOpenerConfigRecord
import com.myreader.readium.Types.ReadiumFileRecord
import com.myreader.readium.Types.SearchOptionsRecord
import com.myreader.readium.Types.SelectionActionRecord
import com.myreader.readium.Types.SelectionMenuRecord
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.epub.EpubLayout
import org.readium.r2.shared.publication.presentation.presentation
import org.readium.r2.shared.publication.services.content.Content
import org.readium.r2.shared.publication.services.content.content
import org.readium.r2.shared.publication.services.search.SearchError
import org.readium.r2.shared.publication.services.search.SearchService
import org.readium.r2.shared.publication.services.search.isSearchable
import org.readium.r2.shared.publication.services.search.search
import org.readium.r2.shared.publication.services.search.searchOptions

@OptIn(ExperimentalReadiumApi::class)
class ReadiumModule : Module() {
  private val searchScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

  override fun definition() = ModuleDefinition {
    Name("Readium")

    // MARK: - View

    View(ReadiumView::class) {
      Events(
        "onLocationChange",
        "onPublicationReady",
        "onDecorationActivated",
        "onSelectionChange",
        "onSelectionAction",
        "onTap"
      )

      Prop("file") { view: ReadiumView, value: ReadiumFileRecord? ->
        view.file = value
      }

      Prop("preferences") { view: ReadiumView, value: PreferencesRecord? ->
        view.preferences = value
      }

      Prop("fontFamilyDeclarations") { view: ReadiumView, value: List<FontFamilyDeclarationRecord>? ->
        view.fontFamilyDeclarations = value
      }

      Prop("decorations") { view: ReadiumView, value: List<DecorationGroupRecord>? ->
        view.decorations = value
      }

      Prop("selectionActions") { view: ReadiumView, value: List<SelectionActionRecord>? ->
        view.selectionActions = value
      }

      Prop("selectionMenu") { view: ReadiumView, value: SelectionMenuRecord? ->
        view.selectionMenu = value
      }

      Prop("customSelectionMenu") { view: ReadiumView, value: Boolean ->
        view.customSelectionMenu = value
      }
    }

    // MARK: - Imperative navigation (view resolved from react tag)

    AsyncFunction("goTo") { tag: Int, locator: LocatorRecord ->
      ReadiumView.registry[tag]?.goTo(locator)
    }

    AsyncFunction("goForward") { tag: Int ->
      ReadiumView.registry[tag]?.goForward()
    }

    AsyncFunction("goBackward") { tag: Int ->
      ReadiumView.registry[tag]?.goBackward()
    }

    AsyncFunction("clearSelection") { tag: Int ->
      ReadiumView.registry[tag]?.clearSelection()
    }

    // MARK: - Streamer open-architecture config (REP-005/006)

    AsyncFunction("configure") { config: PublicationOpenerConfigRecord ->
      StreamerConfig.apply(config)
    }

    AsyncFunction("registerFormat") { registration: FormatRegistrationRecord ->
      StreamerConfig.registerFormat(registration)
    }

    // MARK: - Publication handle (REP-003/004)

    AsyncFunction("getPublicationSnapshot") Coroutine { id: String ->
      val publication = PublicationStore.get(id)
      if (publication == null) {
        null
      } else {
        mapOf<String, Any?>(
          "metadata" to readiumMetadataToMap(publication.metadata),
          "tableOfContents" to flattenReadiumLinksToMaps(publication.tableOfContents),
          "readingOrder" to flattenReadiumLinksToMaps(publication.readingOrder)
        )
      }
    }

    // Content iteration — the path-neutral data source for any future TTS
    // engine (REP-003). Returns utterance-like {text, locator, language}[]
    // built from Publication.content(); the actual TTS coordinator is Phase 2.
    AsyncFunction("getContent") Coroutine { id: String, fromLocator: LocatorRecord? ->
      val publication = PublicationStore.get(id)
      if (publication == null) {
        null
      } else {
        val locator = fromLocator?.let { locatorRecordToReadium(it) }
        val content = publication.content(locator)
        if (content == null) {
          null
        } else {
          val utterances = content.elements().mapNotNull { element ->
            (element as? Content.TextElement)?.let { te ->
              mapOf<String, Any?>(
                "text" to te.text,
                "locator" to readiumLocatorToMap(te.locator),
                "language" to publication.metadata.languages.firstOrNull()
              )
            }
          }
          mapOf<String, Any?>("content" to utterances)
        }
      }
    }

    // MARK: - Search (REP-007)

    AsyncFunction("getSearchCapabilities") { publicationId: String, promise: Promise ->
      val publication = PublicationStore.get(publicationId)
      if (publication == null) {
        promise.reject(
          "ERR_PUBLICATION_NOT_FOUND",
          "Publication not found for id: $publicationId",
          null
        )
        return@AsyncFunction
      }

      val searchable = publication.isSearchableReflowableEpub()
      promise.resolve(
        mapOf<String, Any?>(
          "searchable" to searchable,
          "options" to if (searchable) {
            searchOptionsToMap(publication.searchOptions)
          } else {
            emptyMap<String, Any?>()
          }
        )
      )
    }

    AsyncFunction("search") { publicationId: String, query: String, options: SearchOptionsRecord?, promise: Promise ->
      val publication = PublicationStore.get(publicationId)
      if (publication == null) {
        promise.reject(
          "ERR_PUBLICATION_NOT_FOUND",
          "Publication not found for id: $publicationId",
          null
        )
        return@AsyncFunction
      }
      if (!publication.isSearchableReflowableEpub()) {
        promise.reject(
          "ERR_SEARCH_NOT_SEARCHABLE",
          "Publication does not expose an EPUB search service",
          null
        )
        return@AsyncFunction
      }

      val pending = SearchSessionStore.begin(publicationId)
      val nativeOptions = readiumSearchOptions(options, publication.searchOptions)
      val job = searchScope.launch {
        try {
          val iterator = publication.search(query, nativeOptions)
          currentCoroutineContext().ensureActive()

          if (iterator == null) {
            SearchSessionStore.discard(pending)
            promise.reject(
              "ERR_SEARCH_NOT_SEARCHABLE",
              "Publication does not expose a search service",
              null
            )
            return@launch
          }

          val session = SearchSessionStore.install(iterator, pending)
          if (session == null) {
            iterator.close()
            rejectSearchCancelled(promise)
            return@launch
          }

          val response = mutableMapOf<String, Any?>("id" to session.id)
          iterator.resultCount?.let { response["resultCount"] = it }
          if (!session.deliverIfActive { promise.resolve(response) }) {
            rejectSearchCancelled(promise)
          }
        } catch (_: CancellationException) {
          SearchSessionStore.discard(pending)
          rejectSearchCancelled(promise)
        }
      }
      pending.attach(job)
    }

    AsyncFunction("searchNext") { sessionId: String, promise: Promise ->
      val session = SearchSessionStore.session(sessionId)
      if (session == null) {
        promise.reject(
          "ERR_SEARCH_SESSION_NOT_FOUND",
          "Search session not found for id: $sessionId",
          null
        )
        return@AsyncFunction
      }

      val started = session.startNext(searchScope) {
        try {
          val result = session.iterator.next()
          currentCoroutineContext().ensureActive()

          val error = result.failureOrNull()
          if (error != null) {
            val delivered = session.complete { rejectSearchError(error, promise) }
            SearchSessionStore.remove(session)
            if (!delivered) rejectSearchCancelled(promise)
            return@startNext
          }

          val collection = result.getOrNull()
          val response = mutableMapOf<String, Any?>(
            "locators" to collection?.locators?.map { readiumLocatorToMap(it) }.orEmpty(),
            "done" to (collection == null)
          )
          session.iterator.resultCount?.let { response["resultCount"] = it }

          val delivered = if (collection == null) {
            session.complete { promise.resolve(response) }
              .also { SearchSessionStore.remove(session) }
          } else {
            session.deliverIfActive { promise.resolve(response) }
          }
          if (!delivered) rejectSearchCancelled(promise)
        } catch (_: CancellationException) {
          rejectSearchCancelled(promise)
        } finally {
          session.finishNext()
        }
      }
      if (!started) {
        promise.reject(
          "ERR_SEARCH_IN_PROGRESS",
          "A search page request is already running or the session is closed",
          null
        )
      }
    }

    AsyncFunction("searchCancel") { sessionId: String ->
      SearchSessionStore.cancel(sessionId)
    }

    OnDestroy {
      SearchSessionStore.cancelAll()
      searchScope.cancel()
    }
  }
}

@OptIn(ExperimentalReadiumApi::class)
private fun searchOptionsToMap(options: SearchService.Options): Map<String, Any?> = buildMap {
  options.caseSensitive?.let { put("caseSensitive", it) }
  options.diacriticSensitive?.let { put("diacriticSensitive", it) }
  options.wholeWord?.let { put("wholeWord", it) }
  options.exact?.let { put("exact", it) }
  options.language?.let { put("language", it) }
  options.regularExpression?.let { put("regularExpression", it) }
}

@OptIn(ExperimentalReadiumApi::class)
private fun Publication.isSearchableReflowableEpub(): Boolean =
  conformsTo(Publication.Profile.EPUB) &&
    metadata.presentation.layout != EpubLayout.FIXED &&
    isSearchable

@OptIn(ExperimentalReadiumApi::class)
private fun readiumSearchOptions(
  requested: SearchOptionsRecord?,
  supported: SearchService.Options,
): SearchService.Options? {
  if (requested == null) return null

  return SearchService.Options(
    caseSensitive = requested.caseSensitive.takeIf { supported.caseSensitive != null },
    diacriticSensitive = requested.diacriticSensitive.takeIf {
      supported.diacriticSensitive != null
    },
    wholeWord = requested.wholeWord.takeIf { supported.wholeWord != null },
    exact = requested.exact.takeIf { supported.exact != null },
    language = requested.language.takeIf { supported.language != null },
    regularExpression = requested.regularExpression.takeIf {
      supported.regularExpression != null
    },
  )
}

private fun rejectSearchCancelled(promise: Promise) {
  promise.reject("ERR_SEARCH_CANCELLED", "Search was cancelled", null)
}

@OptIn(ExperimentalReadiumApi::class)
private fun rejectSearchError(error: SearchError, promise: Promise) {
  val code = when (error) {
    is SearchError.Reading -> "ERR_SEARCH_READING"
    is SearchError.Engine -> "ERR_SEARCH_ENGINE"
  }
  promise.reject(code, error.message, null)
}
