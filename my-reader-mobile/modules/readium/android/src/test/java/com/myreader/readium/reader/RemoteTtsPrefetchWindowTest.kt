package com.myreader.readium.reader

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.publication.Manifest
import org.readium.r2.shared.publication.Metadata
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.services.content.Content
import org.readium.r2.shared.publication.services.content.ContentService
import org.readium.r2.shared.publication.services.content.contentServiceFactory
import org.readium.r2.shared.util.Url
import org.readium.r2.shared.util.Language
import org.readium.r2.shared.util.tokenizer.TextUnit
import org.readium.r2.shared.util.mediatype.MediaType
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
@OptIn(ExperimentalReadiumApi::class)
class RemoteTtsPrefetchWindowTest {
  @Test
  fun chapter_preserves_paragraphs_and_locators_without_reading_the_next_chapter() = runBlocking {
    val paragraph = "真昼有一个别称叫做天使大人。她温和诚恳，因而受人欢迎。"
    val first = locator(1, "$paragraph\n下一段。")
    val nextChapter = locator(2, "下一章。").copy(href = requireNotNull(Url("next.xhtml")))
    val publication = publication(first, nextChapter)

    val result = RemoteTtsPrefetchWindow.chapter(publication, first)

    assertEquals(listOf(paragraph, "下一段。"), result.map { it.key.text })
    assertEquals(listOf("zh", "zh"), result.map { it.key.language })
    assertTrue(result.all { it.locator.href == first.href })
    assertEquals(result.map { it.key.text }, result.map { it.locator.text.highlight })
    assertEquals(listOf(1, 1), result.map { it.locator.locations.position })
    publication.close()
  }

  @Test
  fun ordinary_prefetch_still_uses_a_bounded_sentence_window() = runBlocking {
    val start = locator(1, "First sentence. Second sentence. Third sentence. Fourth sentence.")
    val publication = publication(start)

    val result = RemoteTtsPrefetchWindow.load(publication, start, null, Language("en"))

    assertEquals(listOf("First sentence.", "Second sentence.", "Third sentence."), result.map { it.key.text })
    assertTrue(result.all { it.key.language == "en" })
    assertEquals(result.map { it.key.text }, result.map { it.locator.text.highlight })
    publication.close()
  }

  @Test
  fun chapter_returns_no_speech_for_missing_or_nonverbal_content() = runBlocking {
    val start = locator(1, "…\n---\n ")
    val empty = Publication(Manifest(metadata = Metadata()))
    val punctuation = publication(start)

    assertTrue(RemoteTtsPrefetchWindow.chapter(empty, start).isEmpty())
    assertTrue(RemoteTtsPrefetchWindow.chapter(punctuation, start).isEmpty())
    empty.close()
    punctuation.close()
  }

  @Test
  fun should_keep_sentences_in_one_paragraph_for_role_narration() {
    val text = "真昼有一个别称叫做天使大人。她温和诚恳，因而受人欢迎。"
    val tokenizer = StartLocatorTextTokenizer(TextUnit.Paragraph).make(Language("zh"))
    assertEquals(listOf(text), tokenizer.tokenize(text).map { text.substring(it) })
  }

  @Test
  fun should_anchor_repeated_text_to_the_readium_locator() {
    val first = utterance(1, "Again.")
    val second = utterance(2, "Between.")
    val repeated = utterance(3, "Again.")
    val next = utterance(4, "After.")

    val window = remoteTtsPrefetchWindow(
      candidates = listOf(first, second, repeated, next),
      anchor = repeated.locator,
      limit = 3,
    )

    assertEquals(listOf(repeated, next), window)
  }

  @Test
  fun should_reject_a_projection_without_the_current_readium_locator() {
    val candidates = listOf(utterance(1, "First."), utterance(2, "Second."))

    val window = remoteTtsPrefetchWindow(
      candidates = candidates,
      anchor = locator(99, "Missing."),
      limit = 3,
    )

    assertTrue(window.isEmpty())
  }

  @Test
  fun should_limit_an_unanchored_startup_projection() {
    val candidates = (1..4).map { utterance(it, "Sentence $it.") }

    val window = remoteTtsPrefetchWindow(
      candidates = candidates,
      anchor = null,
      limit = 3,
    )

    assertEquals(candidates.take(3), window)
  }

  @Test
  fun should_start_with_the_sentence_containing_the_selected_locator_context() {
    val target = Locator.Text(
      before = "first sentence aloud. Tap this ",
      highlight = "s",
      after = "econd sentence to move the highlight",
    )
    val sentences = listOf(
      Locator.Text(
        highlight = "MyReader reads this first sentence aloud.",
        after = " Tap this second sentence to move the highlight immediately.",
      ),
      Locator.Text(
        before = "MyReader reads this first sentence aloud. ",
        highlight = "Tap this second sentence to move the highlight immediately.",
        after = " This third sentence proves that",
      ),
    )

    assertEquals(1, ttsUtteranceStartIndex(target, sentences))
    val matcher = TtsStartLocatorMatcher()
    matcher.reset(target)
    assertEquals(
      TtsStartLocatorMatch.Start(index = 1, characterOffset = 9),
      matcher.match(sentences),
    )
  }

  @Test
  fun should_clip_a_sentence_to_the_viewport_start() {
    val target = Locator.Text(
      before = "the previous page and ",
      highlight = "c",
      after = "ontinues here. Next complete",
    )
    val matcher = TtsStartLocatorMatcher()
    matcher.reset(target)

    assertEquals(
      TtsStartLocatorMatch.Start(index = 0, characterOffset = 43),
      matcher.match(
        listOf(
          Locator.Text(
            highlight = "A sentence begins on the previous page and continues here.",
            after = " Next complete sentence.",
          ),
          Locator.Text(
            before = "continues here. ",
            highlight = "Next complete sentence.",
          ),
        ),
      ),
    )
  }

  @Test
  fun should_speak_only_the_visible_sentence_suffix() {
    val target = Locator.Text(
      before = "the previous page and ",
      highlight = "c",
      after = "ontinues here. Next complete",
    )
    val sentence = "A sentence begins on the previous page and continues here."
    val text = "$sentence Next complete sentence."
    val tokenizer = StartLocatorTextTokenizer()
    tokenizer.reset(target)

    val ranges = tokenizer.trimToStartLocator(
      text,
      listOf(sentence.indices, sentence.length + 1 until text.length),
    )

    assertEquals("continues here.", text.substring(ranges.first()))
  }

  @Test
  fun should_keep_a_complete_sentence_at_the_viewport_start() {
    val target = Locator.Text(
      before = "continues here. ",
      highlight = "N",
      after = "ext complete sentence.",
    )
    val matcher = TtsStartLocatorMatcher()
    matcher.reset(target)

    assertEquals(
      TtsStartLocatorMatch.Start(index = 1, characterOffset = 0),
      matcher.match(
        listOf(
          Locator.Text(highlight = "A sentence continues here."),
          Locator.Text(
            before = "continues here. ",
            highlight = "Next complete sentence.",
          ),
        ),
      ),
    )
  }

  @Test
  fun should_keep_looking_after_an_earlier_content_block_misses_the_start_locator() {
    val target = Locator.Text(
      before = "first sentence aloud. ",
      highlight = "Tap",
      after = " this second sentence",
    )
    val matcher = TtsStartLocatorMatcher()
    matcher.reset(target)

    assertEquals(
      TtsStartLocatorMatch.Skip,
      matcher.match(listOf(Locator.Text(highlight = "TTS verification"))),
    )
    assertEquals(
      TtsStartLocatorMatch.Start(index = 1, characterOffset = 0),
      matcher.match(
        listOf(
          Locator.Text(highlight = "MyReader reads this first sentence aloud."),
          Locator.Text(
            before = "MyReader reads this first sentence aloud. ",
            highlight = "Tap this second sentence to move the highlight immediately.",
          ),
        ),
      ),
    )
    assertEquals(
      TtsStartLocatorMatch.Passthrough,
      matcher.match(listOf(Locator.Text(highlight = "After."))),
    )
  }

  @Test
  fun should_match_a_selection_whose_context_crosses_a_content_block_boundary() {
    val target = Locator.Text(
      before = "TTS verification\n    ",
      highlight = "MyReader",
      after = " reads this first sentence aloud. Tap this second sentence to move the highlight immediately.",
    )
    val sentences = listOf(
      Locator.Text(highlight = "TTS verification"),
      Locator.Text(
        highlight = "MyReader reads this first sentence aloud.",
        after = " Tap this second sentence to move the highlight immediately.",
      ),
    )

    assertEquals(1, ttsUtteranceStartIndex(target, sentences))
  }

  private fun publication(vararg locators: Locator): Publication = Publication(
    manifest = Manifest(metadata = Metadata(languages = listOf("zh"))),
    servicesBuilder = Publication.ServicesBuilder().apply {
      contentServiceFactory = {
        object : ContentService {
          override fun content(start: Locator?) = object : Content {
            override fun iterator(): Content.Iterator {
              val elements = locators.map { location ->
                Content.TextElement(
                  locator = location,
                  role = Content.TextElement.Role.Body,
                  segments = listOf(Content.TextElement.Segment(location, requireNotNull(location.text.highlight), emptyList())),
                )
              }.listIterator()
              return object : Content.Iterator {
                override suspend fun hasNext() = elements.hasNext()
                override fun next() = elements.next()
                override suspend fun hasPrevious() = elements.hasPrevious()
                override fun previous() = elements.previous()
              }
            }
          }
        }
      }
    },
  )
}

private fun utterance(position: Int, text: String): RemoteTtsPrefetchUtterance =
  RemoteTtsPrefetchUtterance(
    key = RemoteTtsSpeechKey(text = text, language = "en"),
    locator = locator(position, text),
  )

private fun locator(position: Int, text: String): Locator = Locator(
  href = requireNotNull(Url("chapter.xhtml")),
  mediaType = MediaType.XHTML,
  locations = Locator.Locations(position = position),
  text = Locator.Text(highlight = text),
)
