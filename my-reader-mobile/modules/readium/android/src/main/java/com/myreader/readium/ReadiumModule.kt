package com.myreader.readium

import com.myreader.readium.Converters.flattenReadiumLinksToMaps
import com.myreader.readium.Converters.locatorRecordToReadium
import com.myreader.readium.Converters.readiumLocatorToMap
import com.myreader.readium.Converters.readiumMetadataToMap
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
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.readium.r2.shared.publication.services.content.Content
import org.readium.r2.shared.publication.services.content.content

class ReadiumModule : Module() {
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

    // MARK: - Search (REP-007, reserved — Phase 2)

    AsyncFunction("search") { publicationId: String, query: String, options: SearchOptionsRecord?, promise: Promise ->
      promise.reject("ERR_SEARCH_NOT_IMPLEMENTED", "Search (REP-007) is reserved for Phase 2", null)
    }

    AsyncFunction("searchNext") { sessionId: String, promise: Promise ->
      promise.reject("ERR_SEARCH_NOT_IMPLEMENTED", "Search (REP-007) is reserved for Phase 2", null)
    }
  }
}
