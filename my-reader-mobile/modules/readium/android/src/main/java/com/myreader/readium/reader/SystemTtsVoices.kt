package com.myreader.readium.reader

import android.content.Context
import android.speech.tts.TextToSpeech
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

suspend fun systemTtsVoices(context: Context): List<Map<String, Any?>> =
  suspendCancellableCoroutine { continuation ->
    var engine: TextToSpeech? = null
    engine = TextToSpeech(context) { status ->
      val voices = if (status == TextToSpeech.SUCCESS) {
        runCatching {
          engine?.voices.orEmpty()
            .map { voice ->
              mapOf<String, Any?>(
                "id" to voice.name,
                "name" to voice.name,
                "language" to voice.locale.toLanguageTag(),
              )
            }
            .sortedWith(
              compareBy<Map<String, Any?>>(
                { it["language"] as? String },
                { it["name"] as? String },
              )
            )
        }.getOrDefault(emptyList())
      } else {
        emptyList()
      }
      engine?.shutdown()
      engine = null
      if (continuation.isActive) continuation.resume(voices)
    }
    continuation.invokeOnCancellation {
      engine?.shutdown()
      engine = null
    }
  }
