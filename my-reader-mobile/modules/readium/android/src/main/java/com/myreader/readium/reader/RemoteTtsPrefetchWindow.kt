package com.myreader.readium.reader

import java.util.ArrayDeque
import kotlinx.coroutines.CancellationException
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.services.content.Content
import org.readium.r2.shared.publication.services.content.ContentService
import org.readium.r2.shared.publication.services.content.TextContentTokenizer
import org.readium.r2.shared.util.Language
import org.readium.r2.shared.util.tokenizer.TextUnit

data class RemoteTtsSpeechKey(
  val text: String,
  val language: String?,
)

data class RemoteTtsPrefetchUtterance(
  val key: RemoteTtsSpeechKey,
  val locator: Locator,
)

internal fun remoteTtsPrefetchWindow(
  candidates: List<RemoteTtsPrefetchUtterance>,
  anchor: Locator?,
  limit: Int,
): List<RemoteTtsPrefetchUtterance> {
  require(limit > 0)
  val startIndex = if (anchor == null) {
    0
  } else {
    candidates.indexOfFirst { it.locator == anchor }
      .takeIf { it >= 0 }
      ?: return emptyList()
  }
  return candidates.drop(startIndex).take(limit)
}

@OptIn(ExperimentalReadiumApi::class)
object RemoteTtsPrefetchWindow {
  private const val WINDOW_SIZE = 3
  private const val MAX_SCANNED_UTTERANCES = 128

  suspend fun load(
    publication: Publication,
    start: Locator?,
    anchor: Locator?,
    defaultLanguage: Language?,
  ): List<RemoteTtsPrefetchUtterance> {
    val loader = Loader(publication, start, defaultLanguage)
    val candidates = mutableListOf<RemoteTtsPrefetchUtterance>()
    while (candidates.size < MAX_SCANNED_UTTERANCES) {
      candidates += loader.nextUtterance() ?: break
      val window = remoteTtsPrefetchWindow(candidates, anchor, WINDOW_SIZE)
      if (window.size == WINDOW_SIZE) return window
    }
    return remoteTtsPrefetchWindow(candidates, anchor, WINDOW_SIZE)
  }

  private class Loader(
    publication: Publication,
    start: Locator?,
    private val defaultLanguage: Language?,
  ) {
    private val iterator = publication.findService(ContentService::class)
      ?.content(start)
      ?.iterator()
    private val tokenizer = TextContentTokenizer(
      language = defaultLanguage,
      unit = TextUnit.Sentence,
      overrideContentLanguage = false,
    )
    private val buffered = ArrayDeque<RemoteTtsPrefetchUtterance>()

    suspend fun nextUtterance(): RemoteTtsPrefetchUtterance? {
      while (buffered.isEmpty()) {
        val utterances = try {
          val element = iterator?.nextOrNull() ?: return null
          tokenizer.tokenize(element).flatMap(::utterances)
        } catch (error: CancellationException) {
          throw error
        } catch (_: Exception) {
          return null
        }
        utterances.forEach(buffered::addLast)
      }
      return buffered.removeFirst()
    }

    private fun utterances(element: Content.Element): List<RemoteTtsPrefetchUtterance> {
      fun utterance(
        text: String,
        locator: Locator,
        language: Language? = null,
      ): RemoteTtsPrefetchUtterance? {
        if (text.none { it.isLetterOrDigit() }) return null
        return RemoteTtsPrefetchUtterance(
          key = RemoteTtsSpeechKey(text, language?.code ?: defaultLanguage?.code),
          locator = locator,
        )
      }

      return when (element) {
        is Content.TextElement -> element.segments.mapNotNull { segment ->
          utterance(segment.text, segment.locator, segment.language)
        }

        is Content.TextualElement -> listOfNotNull(
          element.text
            ?.takeIf { it.isNotBlank() }
            ?.let { utterance(it, element.locator) },
        )

        else -> emptyList()
      }
    }
  }
}
