package com.myreader.readium.reader

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import com.myreader.readium.Types.TtsSynthesisCompletionRecord
import com.myreader.readium.Types.TtsPlaybackSegmentRecord
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.readium.navigator.media.tts.TtsEngine
import org.readium.navigator.media.tts.TtsEngineProvider
import org.readium.r2.navigator.preferences.PreferencesEditor
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.util.Error
import org.readium.r2.shared.util.Language
import org.readium.r2.shared.util.Try

@OptIn(ExperimentalReadiumApi::class)
data class RemoteTtsPreferences(
  override val language: Language? = null,
  val speed: Double? = null,
  val pitch: Double? = null,
) : TtsEngine.Preferences<RemoteTtsPreferences> {
  override fun plus(other: RemoteTtsPreferences): RemoteTtsPreferences = copy(
    language = other.language ?: language,
    speed = other.speed ?: speed,
    pitch = other.pitch ?: pitch,
  )
}

@OptIn(ExperimentalReadiumApi::class)
data class RemoteTtsSettings(
  override val language: Language?,
  override val overrideContentLanguage: Boolean,
  val speed: Double,
  val pitch: Double,
) : TtsEngine.Settings

@OptIn(ExperimentalReadiumApi::class)
data class RemoteTtsVoice(
  override val language: Language,
) : TtsEngine.Voice

@OptIn(ExperimentalReadiumApi::class)
data class RemoteTtsError(
  override val message: String,
  override val cause: Error? = null,
) : TtsEngine.Error

class RemoteTtsPreferencesEditor(
  initialPreferences: RemoteTtsPreferences,
) : PreferencesEditor<RemoteTtsPreferences> {
  private var value = initialPreferences
  override val preferences: RemoteTtsPreferences get() = value
  override fun clear() {
    value = RemoteTtsPreferences()
  }
}

data class RemoteTtsSynthesisRequest(
  val requestId: String,
  val key: RemoteTtsSpeechKey,
  val profileId: String,
  val voiceId: String,
  val speed: Double,
  val pitch: Double,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "requestId" to requestId,
    "text" to key.text,
    "language" to key.language,
    "profileId" to profileId,
    "voiceId" to voiceId,
    "speed" to speed,
    "pitch" to pitch,
  )
}

@OptIn(ExperimentalReadiumApi::class)
class RemoteTtsEngine(
  private val context: Context,
  private val profileId: String,
  private val voiceId: String,
  initialPreferences: RemoteTtsPreferences,
  private val onRequest: (RemoteTtsSynthesisRequest) -> Unit,
  private val onCancel: (List<String>) -> Unit,
  private val onBuffering: (RemoteTtsSpeechKey, Boolean) -> Unit,
) : TtsEngine<
  RemoteTtsSettings,
  RemoteTtsPreferences,
  RemoteTtsError,
  RemoteTtsVoice
> {
  private data class CacheEntry(
    val id: String,
    val key: RemoteTtsSpeechKey,
    var completion: TtsSynthesisCompletionRecord? = null,
  )

  private data class ActiveRequest(
    val id: TtsEngine.RequestId,
    val key: RemoteTtsSpeechKey,
    val text: String,
    var player: MediaPlayer? = null,
    var started: Boolean = false,
    var segments: List<TtsPlaybackSegmentRecord> = emptyList(),
    var segmentIndex: Int = 0,
  )

  private val scope: CoroutineScope = MainScope()
  private val mutableSettings = MutableStateFlow(initialPreferences.toSettings())
  private var listener: TtsEngine.Listener<RemoteTtsError>? = null
  private val entries = linkedMapOf<RemoteTtsSpeechKey, CacheEntry>()
  private val keysByRequestId = mutableMapOf<String, RemoteTtsSpeechKey>()
  private var desiredKeys = emptySet<RemoteTtsSpeechKey>()
  private var active: ActiveRequest? = null
  private var isClosed = false
  private var systemSpeech: TextToSpeech? = null
  private var systemReady = false
  private var systemUtteranceId: String? = null

  override val settings: StateFlow<RemoteTtsSettings> = mutableSettings.asStateFlow()
  override val voices: Set<RemoteTtsVoice> = emptySet()

  override fun submitPreferences(preferences: RemoteTtsPreferences) {
    mutableSettings.value = preferences.toSettings()
  }

  override fun setListener(listener: TtsEngine.Listener<RemoteTtsError>?) {
    this.listener = listener
  }

  fun setPrefetchWindow(utterances: List<RemoteTtsPrefetchUtterance>) {
    if (profileId == "narration") return
    val nextKeys = utterances.mapTo(mutableSetOf()) { it.key }
    active?.let { nextKeys += it.key }
    desiredKeys = nextKeys

    val stale = entries.filterKeys { it !in nextKeys }.values.toList()
    val cancelled = stale.mapNotNull { entry ->
      entry.id.takeIf { entry.completion == null }
    }
    stale.forEach { removeEntry(it.key) }
    utterances.forEach { ensureEntry(it.key) }
    if (cancelled.isNotEmpty()) onCancel(cancelled)
  }

  override fun speak(
    requestId: TtsEngine.RequestId,
    text: String,
    language: Language?,
  ) {
    check(!isClosed) { "Engine is closed." }
    stop()
    val key = RemoteTtsSpeechKey(
      text = text,
      language = language?.code ?: settings.value.language?.code,
    )
    val request = ActiveRequest(requestId, key, text)
    active = request
    val entry = ensureEntry(key)
    entry.completion?.let { startPlayback(request, it) }
      ?: onBuffering(key, true)
  }

  fun complete(completion: TtsSynthesisCompletionRecord) {
    val key = keysByRequestId[completion.requestId] ?: return
    val entry = entries[key]?.takeIf { it.id == completion.requestId } ?: return
    entry.completion = completion
    active?.takeIf { it.key == key }?.let { startPlayback(it, completion) }
  }

  override fun stop() {
    val request = active ?: return
    active = null
    systemUtteranceId = null
    systemSpeech?.stop()
    request.player?.runCatching { stop() }
    request.player?.release()
    request.player = null
    if (request.started) {
      listener?.onInterrupted(request.id)
    } else {
      listener?.onFlushed(request.id)
    }
    if (request.key !in desiredKeys) {
      val pending = entries[request.key]?.takeIf { it.completion == null }?.id
      removeEntry(request.key)
      if (pending != null) onCancel(listOf(pending))
    }
  }

  fun cancelAll() {
    stop()
    val cancelled = entries.values.mapNotNull { entry ->
      entry.id.takeIf { entry.completion == null }
    }
    entries.clear()
    keysByRequestId.clear()
    desiredKeys = emptySet()
    if (cancelled.isNotEmpty()) onCancel(cancelled)
  }

  override fun close() {
    if (isClosed) return
    cancelAll()
    isClosed = true
    systemSpeech?.shutdown()
    systemSpeech = null
    scope.cancel()
  }

  private fun ensureEntry(key: RemoteTtsSpeechKey): CacheEntry {
    entries[key]?.let { return it }
    val entry = CacheEntry(UUID.randomUUID().toString(), key)
    entries[key] = entry
    keysByRequestId[entry.id] = key
    val settings = settings.value
    onRequest(
      RemoteTtsSynthesisRequest(
        requestId = entry.id,
        key = key,
        profileId = profileId,
        voiceId = voiceId,
        speed = settings.speed,
        pitch = settings.pitch,
      )
    )
    return entry
  }

  private fun startPlayback(
    request: ActiveRequest,
    completion: TtsSynthesisCompletionRecord,
  ) {
    if (active !== request || request.player != null || systemUtteranceId != null) return
    completion.error?.takeIf { it.isNotEmpty() }?.let { error ->
      fail(request, RemoteTtsError(error))
      return
    }
    request.segments = completion.segments?.takeIf { it.isNotEmpty() } ?: listOf(
      TtsPlaybackSegmentRecord(text = request.text, endUtf16 = request.text.length, path = completion.path, timings = completion.timings, playbackRate = completion.playbackRate)
    )
    playSegment(request)
  }

  private fun playSegment(request: ActiveRequest) {
    if (active !== request) return
    val segment = request.segments.getOrNull(request.segmentIndex) ?: return finish(request)
    if (segment.startUtf16 < 0 || segment.endUtf16 > request.text.length || segment.endUtf16 <= segment.startUtf16 || request.text.substring(segment.startUtf16, segment.endUtf16) != segment.text) {
      return fail(request, RemoteTtsError("NARRATION_PLAN_INVALID"))
    }
    if (segment.systemVoiceId != null) {
      speakSystem(request, segment)
      return
    }
    val path = segment.path
    if (path.isNullOrEmpty()) {
      fail(request, RemoteTtsError("TTS provider returned no audio path."))
      return
    }

    val player = MediaPlayer()
    request.player = player
    player.setAudioAttributes(
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    )
    player.setOnPreparedListener {
      if (active !== request) return@setOnPreparedListener
      try {
        segment.playbackRate?.let { rate ->
          it.playbackParams = it.playbackParams.setSpeed(rate.toFloat())
        }
      } catch (error: Exception) {
        fail(request, RemoteTtsError(error.message ?: "Unable to set speech playback rate."))
        return@setOnPreparedListener
      }
      if (!request.started) listener?.onStart(request.id)
      request.started = true
      onBuffering(request.key, false)
      listener?.onRange(request.id, segment.startUtf16 until segment.endUtf16)
      it.start()
      scheduleTimings(request, segment)
    }
    player.setOnCompletionListener {
      if (active === request) advance(request)
    }
    player.setOnErrorListener { _, what, extra ->
      if (active === request) {
        fail(request, RemoteTtsError("Audio playback failed ($what/$extra)."))
      }
      true
    }

    runCatching {
      if (path.startsWith("file://")) {
        player.setDataSource(context, Uri.parse(path))
      } else {
        player.setDataSource(path)
      }
      player.prepareAsync()
    }.onFailure { error ->
      fail(request, RemoteTtsError(error.message ?: "Unable to open synthesized audio."))
    }
  }

  private fun finish(request: ActiveRequest) {
    if (active !== request) return
    active = null
    systemUtteranceId = null
    request.player?.release()
    request.player = null
    listener?.onDone(request.id)
    if (request.key !in desiredKeys) removeEntry(request.key)
  }

  private fun fail(request: ActiveRequest, error: RemoteTtsError) {
    if (active !== request) return
    active = null
    systemUtteranceId = null
    systemSpeech?.stop()
    request.player?.release()
    request.player = null
    removeEntry(request.key)
    listener?.onError(request.id, error)
  }

  private fun removeEntry(key: RemoteTtsSpeechKey) {
    val entry = entries.remove(key) ?: return
    keysByRequestId.remove(entry.id)
  }

  private fun scheduleTimings(
    request: ActiveRequest,
    segment: TtsPlaybackSegmentRecord,
  ) {
    val index = request.segmentIndex
    segment.timings.orEmpty().forEach { timing ->
      if (timing.startUtf16 < 0 ||
        timing.endUtf16 <= timing.startUtf16 ||
        timing.endUtf16 > segment.text.length
      ) return@forEach
      scope.launch {
        delay((timing.startMs.coerceAtLeast(0.0) / (segment.playbackRate ?: 1.0)).toLong())
        if (active === request && request.segmentIndex == index) {
          listener?.onRange(request.id, (segment.startUtf16 + timing.startUtf16) until (segment.startUtf16 + timing.endUtf16))
        }
      }
    }
  }

  private fun advance(request: ActiveRequest) {
    if (active !== request) return
    request.player?.release()
    request.player = null
    systemUtteranceId = null
    request.segmentIndex += 1
    playSegment(request)
  }

  private fun speakSystem(request: ActiveRequest, segment: TtsPlaybackSegmentRecord) {
    if (systemSpeech == null) {
      systemSpeech = TextToSpeech(context) { status ->
        scope.launch {
          if (isClosed) return@launch
          systemReady = status == TextToSpeech.SUCCESS
          if (!systemReady) { active?.let { fail(it, RemoteTtsError("TTS_SYSTEM_UNAVAILABLE")) }; return@launch }
          systemSpeech?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) { scope.launch {
              val current = active ?: return@launch
              if (systemUtteranceId != utteranceId) return@launch
              if (!current.started) listener?.onStart(current.id)
              current.started = true
              onBuffering(current.key, false)
            } }
            override fun onDone(utteranceId: String?) { scope.launch { active?.takeIf { systemUtteranceId == utteranceId }?.let(::advance) } }
            @Deprecated("Deprecated in Android")
            override fun onError(utteranceId: String?) { scope.launch { active?.takeIf { systemUtteranceId == utteranceId }?.let { fail(it, RemoteTtsError("TTS_SYSTEM_FAILED")) } } }
            override fun onRangeStart(utteranceId: String?, start: Int, end: Int, frame: Int) { scope.launch {
              val current = active ?: return@launch
              if (systemUtteranceId != utteranceId) return@launch
              val offset = current.segments[current.segmentIndex].startUtf16
              listener?.onRange(current.id, (offset + start) until (offset + end))
            } }
          })
          active?.let { current -> current.segments.getOrNull(current.segmentIndex)?.takeIf { it.systemVoiceId != null }?.let { speakSystem(current, it) } }
        }
      }
      return
    }
    if (!systemReady) return
    val speech = systemSpeech ?: return
    speech.language = Locale.forLanguageTag(request.key.language ?: settings.value.language?.code ?: Locale.getDefault().toLanguageTag())
    speech.voices?.find { it.name == segment.systemVoiceId }?.let { speech.voice = it }
    speech.setSpeechRate(settings.value.speed.toFloat())
    speech.setPitch(settings.value.pitch.toFloat())
    val id = UUID.randomUUID().toString()
    systemUtteranceId = id
    if (speech.speak(segment.text, TextToSpeech.QUEUE_FLUSH, null, id) == TextToSpeech.ERROR) fail(request, RemoteTtsError("TTS_SYSTEM_FAILED"))
  }

  private fun RemoteTtsPreferences.toSettings() = RemoteTtsSettings(
    language = language,
    overrideContentLanguage = false,
    speed = speed ?: 1.0,
    pitch = pitch ?: 1.0,
  )
}

@OptIn(ExperimentalReadiumApi::class)
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class RemoteTtsEngineProvider(
  private val context: Context,
  private val profileId: String,
  private val voiceId: String,
  private val onRequest: (RemoteTtsSynthesisRequest) -> Unit,
  private val onCancel: (List<String>) -> Unit,
  private val onBuffering: (RemoteTtsSpeechKey, Boolean) -> Unit,
) : TtsEngineProvider<
  RemoteTtsSettings,
  RemoteTtsPreferences,
  RemoteTtsPreferencesEditor,
  RemoteTtsError,
  RemoteTtsVoice
> {
  var engine: RemoteTtsEngine? = null
    private set

  override suspend fun createEngine(
    publication: Publication,
    initialPreferences: RemoteTtsPreferences,
  ): Try<RemoteTtsEngine, Error> {
    val value = RemoteTtsEngine(
      context = context,
      profileId = profileId,
      voiceId = voiceId,
      initialPreferences = initialPreferences,
      onRequest = onRequest,
      onCancel = onCancel,
      onBuffering = onBuffering,
    )
    engine = value
    return Try.success(value)
  }

  override fun createPreferencesEditor(
    publication: Publication,
    initialPreferences: RemoteTtsPreferences,
  ) = RemoteTtsPreferencesEditor(initialPreferences)

  override fun createEmptyPreferences() = RemoteTtsPreferences()

  override fun getPlaybackParameters(settings: RemoteTtsSettings) =
    PlaybackParameters(settings.speed.toFloat(), settings.pitch.toFloat())

  override fun updatePlaybackParameters(
    previousPreferences: RemoteTtsPreferences,
    playbackParameters: PlaybackParameters,
  ) = previousPreferences.copy(
    speed = playbackParameters.speed.toDouble(),
    pitch = playbackParameters.pitch.toDouble(),
  )

  override fun mapEngineError(error: RemoteTtsError) = PlaybackException(
    error.message,
    null,
    PlaybackException.ERROR_CODE_UNSPECIFIED,
  )
}
