export const TTS_AUDIO_FORMATS = ["mp3", "opus", "aac", "flac", "wav"] as const

export type TtsAudioFormat = (typeof TTS_AUDIO_FORMATS)[number]

export function normalizeTtsAudioFormat(
  value: string | undefined,
): TtsAudioFormat {
  return TTS_AUDIO_FORMATS.find((format) => format === value) ?? "mp3"
}
