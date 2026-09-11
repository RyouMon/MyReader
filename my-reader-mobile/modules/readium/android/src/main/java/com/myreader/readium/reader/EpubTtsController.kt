package com.myreader.readium.reader

import android.app.Application
import android.graphics.Color
import com.myreader.readium.Converters.readiumLocatorToMap
import com.myreader.readium.Types.TtsEngineConfigRecord
import com.myreader.readium.Types.TtsSynthesisCompletionRecord
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import org.readium.navigator.media.tts.TtsNavigator
import org.readium.navigator.media.tts.TtsNavigatorFactory
import org.readium.navigator.media.tts.android.AndroidTtsDefaults
import org.readium.navigator.media.tts.android.AndroidTtsEngine
import org.readium.navigator.media.tts.android.AndroidTtsPreferences
import org.readium.r2.navigator.DecorableNavigator
import org.readium.r2.navigator.Decoration
import org.readium.r2.navigator.VisualNavigator
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.util.Language
import org.readium.r2.shared.util.getOrElse
import org.readium.r2.shared.util.tokenizer.DefaultTextContentTokenizer
import org.readium.r2.shared.util.tokenizer.TextUnit
import org.readium.r2.shared.util.tokenizer.Tokenizer

private data class TtsUtteranceStartAlignment(
  val index: Int,
  val startsInsideCandidate: Boolean,
)

private fun ttsUtteranceStartAlignment(
  target: Locator.Text,
  candidates: List<Locator.Text>,
): TtsUtteranceStartAlignment? {
  val targetContext = normalizedTtsLocatorContext(target) ?: return null
  candidates.forEachIndexed { index, candidate ->
    val candidateContext = normalizedTtsLocatorContext(candidate)
      ?: return@forEachIndexed
    targetContext.occurrencesIn(candidateContext.characters).forEach { occurrence ->
      val targetStart = occurrence + targetContext.highlight.first
      val targetEnd = occurrence + targetContext.highlight.last
      if (
        targetStart <= candidateContext.highlight.last &&
        candidateContext.highlight.first <= targetEnd
      ) {
        return TtsUtteranceStartAlignment(
          index = index,
          startsInsideCandidate = targetStart > candidateContext.highlight.first,
        )
      }
    }
    candidateContext.occurrencesIn(targetContext.characters).forEach { occurrence ->
      val candidateStart = occurrence + candidateContext.highlight.first
      val candidateEnd = occurrence + candidateContext.highlight.last
      if (
        candidateStart <= targetContext.highlight.last &&
        targetContext.highlight.first <= candidateEnd
      ) {
        return TtsUtteranceStartAlignment(
          index = index,
          startsInsideCandidate = targetContext.highlight.first > candidateStart,
        )
      }
    }
  }
  return null
}

internal fun ttsUtteranceStartIndex(
  target: Locator.Text,
  candidates: List<Locator.Text>,
): Int? = ttsUtteranceStartAlignment(target, candidates)?.index

private data class NormalizedTtsLocatorContext(
  val characters: String,
  val highlight: IntRange,
) {
  fun occurrencesIn(value: String): List<Int> {
    if (characters.isEmpty() || characters.length > value.length) return emptyList()
    return (0..value.length - characters.length).filter { start ->
      value.regionMatches(start, characters, 0, characters.length)
    }
  }
}

private fun normalizedTtsLocatorContext(
  text: Locator.Text,
): NormalizedTtsLocatorContext? {
  val highlight = text.highlight?.takeIf(String::isNotEmpty) ?: return null
  val startMarker = '\uE000'
  val endMarker = '\uE001'
  val normalized = collapseTtsWhitespace(
    (text.before ?: "") + startMarker + highlight + endMarker + (text.after ?: "")
  )
  val start = normalized.indexOf(startMarker)
  val end = normalized.indexOf(endMarker)
  if (start < 0 || end <= start) return null
  return NormalizedTtsLocatorContext(
    characters = normalized.filter { it != startMarker && it != endMarker },
    highlight = start until end - 1,
  )
}

private fun collapseTtsWhitespace(value: String): String = buildString {
  var pendingWhitespace = false
  value.forEach { character ->
    if (character.isWhitespace()) {
      pendingWhitespace = isNotEmpty()
    } else {
      if (pendingWhitespace) append(' ')
      append(character)
      pendingWhitespace = false
    }
  }
}

internal fun ttsFollowStaysInCurrentResource(
  currentHref: String?,
  targetHref: String,
): Boolean = currentHref == targetHref

internal sealed interface TtsStartLocatorMatch {
  data object Passthrough : TtsStartLocatorMatch
  data object Skip : TtsStartLocatorMatch
  data class Start(val index: Int) : TtsStartLocatorMatch
}

internal class TtsStartLocatorMatcher {
  private var target: Locator.Text? = null
  private var skipPartialSentence = false

  @Synchronized
  fun reset(target: Locator.Text?, skipPartialSentence: Boolean = false) {
    this.target = target?.takeIf { !it.highlight.isNullOrEmpty() }
    this.skipPartialSentence = skipPartialSentence
  }

  @Synchronized
  fun match(candidates: List<Locator.Text>): TtsStartLocatorMatch {
    val target = target ?: return TtsStartLocatorMatch.Passthrough
    val alignment = ttsUtteranceStartAlignment(target, candidates)
      ?: return TtsStartLocatorMatch.Skip
    this.target = null
    return TtsStartLocatorMatch.Start(
      alignment.index + if (skipPartialSentence && alignment.startsInsideCandidate) 1 else 0
    )
  }
}

private class StartLocatorTextTokenizer {
  private val startLocatorMatcher = TtsStartLocatorMatcher()

  fun reset(target: Locator.Text?, skipPartialSentence: Boolean) {
    startLocatorMatcher.reset(target, skipPartialSentence)
  }

  fun make(language: Language?): Tokenizer<String, IntRange> {
    val tokenizer = DefaultTextContentTokenizer(TextUnit.Sentence, language)
    return object : Tokenizer<String, IntRange> {
      override fun tokenize(data: String): List<IntRange> =
        trimToStartLocator(data, tokenizer.tokenize(data))
    }
  }

  @Synchronized
  private fun trimToStartLocator(
    text: String,
    ranges: List<IntRange>,
  ): List<IntRange> {
    if (ranges.isEmpty()) return ranges
    val candidates = ranges.map { range ->
      val start = range.first.coerceIn(0, text.length)
      val end = (range.last + 1).coerceIn(start, text.length)
      Locator.Text(
        before = text.substring(maxOf(0, start - 50), start).takeIf(String::isNotEmpty),
        highlight = text.substring(start, end),
        after = text.substring(end, minOf(text.length, end + 50)).takeIf(String::isNotEmpty),
      )
    }
    return when (val match = startLocatorMatcher.match(candidates)) {
      TtsStartLocatorMatch.Passthrough -> ranges
      TtsStartLocatorMatch.Skip -> emptyList()
      is TtsStartLocatorMatch.Start -> ranges.drop(match.index)
    }
  }
}

@OptIn(ExperimentalReadiumApi::class)
class EpubTtsController(
  private val application: Application,
  private val publication: Publication,
  private val visualNavigator: VisualNavigator,
  private val scope: CoroutineScope,
  private val config: TtsEngineConfigRecord,
  private val onStateChange: (Map<String, Any?>) -> Unit,
  private val onSynthesisRequest: (Map<String, Any?>) -> Unit,
  private val onSynthesisCancel: (Map<String, Any?>) -> Unit,
  private val navigateForFollow: suspend (Locator) -> Unit,
  private val shouldFollowText: () -> Boolean,
  private val onFollowTextNavigation: (String, Locator, Boolean) -> Unit,
) : TtsNavigator.Listener {
  companion object {
    private const val DECORATION_GROUP = "tts"
  }

  private var navigator: TtsNavigator<*, *, *, *>? = null
  private var remoteProvider: RemoteTtsEngineProvider? = null
  private var remotePrefetchJob: Job? = null
  private var remotePrefetchAnchor: Locator? = null
  private var remotePrefetchRevision = 0L
  private val observationJobs = mutableListOf<Job>()
  private var currentLocation: TtsNavigator.Location? = null
  private var currentPlayback: TtsNavigator.Playback? = null

  fun currentPlaybackLocator(): Locator? = currentLocation?.utteranceLocator
  private var remoteBufferingKey: RemoteTtsSpeechKey? = null
  private var highlightedLocator: Locator? = null
  private var followedLocator: Locator? = null
  private var followNavigationJob: Job? = null
  private val startLocatorTokenizer = StartLocatorTextTokenizer()

  suspend fun start(from: Locator?, skipPartialSentence: Boolean = false) {
    close(emitState = false)
    onStateChange(mapOf("state" to "loading"))
    val initialLocator = from ?: visualNavigator.firstVisibleElementLocator()
    startLocatorTokenizer.reset(initialLocator?.text, skipPartialSentence)

    if (config.kind == "provider") {
      startRemote(initialLocator)
    } else {
      startSystem(initialLocator)
    }
  }

  private suspend fun startSystem(initialLocator: Locator?) {
    val factory = TtsNavigatorFactory(
      application = application,
      publication = publication,
      tokenizerFactory = startLocatorTokenizer::make,
      defaults = AndroidTtsDefaults(
        language = config.language?.let(::Language),
        pitch = config.pitch,
        speed = config.speed,
      ),
      voiceSelector = { language, voices ->
        val requestedLanguage = language?.removeRegion()
        if (requestedLanguage == null) {
          null
        } else {
          config.voiceId?.let { id ->
            voices.firstOrNull {
              it.id.value == id && it.language?.removeRegion() == requestedLanguage
            }
          }
        }
      },
    ) ?: return fail("This publication does not expose readable text content.")

    val value = factory.createNavigator(
      listener = this,
      initialLocator = initialLocator,
      initialPreferences = AndroidTtsPreferences(
        language = null,
        pitch = config.pitch,
        speed = config.speed,
      ),
    ).getOrElse { error ->
      fail(error.message)
      return
    }
    bind(value)
    value.play()
  }

  private suspend fun startRemote(initialLocator: Locator?) {
    val profileId = config.profileId?.takeIf { it.isNotEmpty() }
      ?: return fail("A provider profile is required for remote TTS.")
    val voiceId = config.voiceId?.takeIf { it.isNotEmpty() }
      ?: return fail("A voice is required for remote TTS.")
    val provider = RemoteTtsEngineProvider(
      context = application,
      profileId = profileId,
      voiceId = voiceId,
      onRequest = { request ->
        onSynthesisRequest(request.toMap())
      },
      onCancel = { requestIds ->
        onSynthesisCancel(mapOf("requestIds" to requestIds))
      },
      onBuffering = { key, buffering ->
        remoteBufferingKey = if (buffering) key else null
        val activeNavigator = navigator
        val playback = currentPlayback
        if (activeNavigator != null && playback != null) {
          emitPlayback(activeNavigator, playback)
        }
        if (!buffering) followCurrentLocation()
      },
    )
    val factory = TtsNavigatorFactory(
      application = application,
      publication = publication,
      ttsEngineProvider = provider,
      tokenizerFactory = startLocatorTokenizer::make,
    ) ?: return fail("This publication does not expose readable text content.")

    val value = factory.createNavigator(
      listener = this,
      initialLocator = initialLocator,
      initialPreferences = RemoteTtsPreferences(
        language = config.language?.let(::Language),
        speed = config.speed,
        pitch = config.pitch,
      ),
    ).getOrElse { error ->
      fail(error.message)
      return
    }
    remoteProvider = provider
    bind(value)
    value.play()
  }

  private fun bind(value: TtsNavigator<*, *, *, *>) {
    navigator = value
    observationJobs += value.location
      .onEach { location ->
        currentLocation = location
        scheduleRemotePrefetch(location.utteranceLocator)
        if (highlightedLocator != location.utteranceLocator) {
          highlightedLocator = location.utteranceLocator
          updateHighlight(location.utteranceLocator)
          if (remoteBufferingKey == null) followCurrentLocation()
        }
      }
      .launchIn(scope)
    observationJobs += value.playback
      .onEach { playback ->
        currentPlayback = playback
        emitPlayback(value, playback)
      }
      .launchIn(scope)
  }

  private fun emitPlayback(
    value: TtsNavigator<*, *, *, *>,
    playback: TtsNavigator.Playback,
  ) {
    val state = when (playback.state) {
      is TtsNavigator.State.Ended -> "ended"
      is TtsNavigator.State.Failure -> "error"
      else -> if (playback.playWhenReady) {
        if (remoteBufferingKey != null) "loading" else "playing"
      } else {
        "paused"
      }
    }
    if (state == "ended") clearHighlight()
    val payload = mutableMapOf<String, Any?>(
      "state" to state,
      "utterance" to playback.utterance,
      "canGoPrevious" to value.hasPreviousUtterance(),
      "canGoNext" to value.hasNextUtterance(),
    )
    currentLocation?.let { location ->
      payload["locator"] = readiumLocatorToMap(location.utteranceLocator)
    }
    (playback.state as? TtsNavigator.State.Failure)?.let { failure ->
      payload["error"] = failure.error.message
    }
    onStateChange(payload)
  }

  fun play() {
    navigator?.play()
  }

  fun pause() {
    navigator?.pause()
  }

  fun prepareForUserNavigation() {
    followNavigationJob?.cancel()
    followNavigationJob = null
    followedLocator = null
  }

  fun previous() {
    navigator?.skipToPreviousUtterance()
  }

  fun next() {
    navigator?.skipToNextUtterance()
  }

  fun complete(completion: TtsSynthesisCompletionRecord) {
    remoteProvider?.engine?.complete(completion)
  }

  fun close(emitState: Boolean = true) {
    observationJobs.forEach { it.cancel() }
    observationJobs.clear()
    followNavigationJob?.cancel()
    followNavigationJob = null
    invalidateRemotePrefetch()
    remoteProvider?.engine?.cancelAll()
    navigator?.close()
    navigator = null
    remoteProvider = null
    currentLocation = null
    currentPlayback = null
    remoteBufferingKey = null
    followedLocator = null
    clearHighlight()
    if (emitState) onStateChange(mapOf("state" to "stopped"))
  }

  override fun onStopRequested() {
    close()
  }

  private fun scheduleRemotePrefetch(anchor: Locator) {
    val engine = remoteProvider?.engine ?: return
    if (remotePrefetchAnchor == anchor) return
    remotePrefetchAnchor = anchor
    val revision = ++remotePrefetchRevision
    remotePrefetchJob?.cancel()
    remotePrefetchJob = scope.launch {
      val window = RemoteTtsPrefetchWindow.load(
        publication = publication,
        start = anchor,
        anchor = anchor,
        defaultLanguage = config.language?.let(::Language),
      )
      if (revision != remotePrefetchRevision || remoteProvider?.engine !== engine) {
        return@launch
      }
      engine.setPrefetchWindow(window)
      remotePrefetchJob = null
    }
  }

  private fun invalidateRemotePrefetch() {
    remotePrefetchRevision++
    remotePrefetchJob?.cancel()
    remotePrefetchJob = null
    remotePrefetchAnchor = null
  }

  private fun updateHighlight(locator: Locator) {
    val tint = runCatching {
      Color.parseColor(config.highlightColor ?: "#B8F6C7AA")
    }.getOrDefault(Color.argb(184, 246, 199, 170))
    scope.launch {
      (visualNavigator as? DecorableNavigator)?.applyDecorations(
        listOf(
          Decoration(
            id = "tts-current-sentence",
            locator = locator,
            style = Decoration.Style.Highlight(tint),
          )
        ),
        DECORATION_GROUP,
      )
    }
  }

  private fun followCurrentLocation() {
    if (!shouldFollowText()) return
    val locator = currentLocation?.utteranceLocator ?: return
    if (followedLocator == locator) return
    followedLocator = locator
    followNavigationJob?.cancel()
    followNavigationJob = scope.launch {
      if (!shouldFollowText() || followedLocator != locator) return@launch
      val navigationId = UUID.randomUUID().toString()
      onFollowTextNavigation(navigationId, locator, true)
      try {
        if (shouldFollowText()) navigateForFollow(locator)
      } finally {
        onFollowTextNavigation(navigationId, locator, false)
      }
    }
  }

  private fun clearHighlight() {
    followNavigationJob?.cancel()
    followNavigationJob = null
    highlightedLocator = null
    followedLocator = null
    scope.launch {
      (visualNavigator as? DecorableNavigator)?.applyDecorations(
        emptyList(),
        DECORATION_GROUP,
      )
    }
  }

  private fun fail(message: String) {
    clearHighlight()
    onStateChange(mapOf("state" to "error", "error" to message))
  }
}
