export const TTS_AUDIO_FORMATS = ["mp3", "opus", "aac", "flac", "wav"] as const

export type TtsAudioFormat = (typeof TTS_AUDIO_FORMATS)[number]

export function ttsMaximumPlaybackSpeed(profile?: {
  kind: string
  model?: string
}) {
  // Qwen3 returns normal-speed audio. Both mobile players support up to 2×
  // time stretching; Qwen Audio Plus can also change speed during synthesis.
  return profile?.kind === "qwen" && profile.model?.startsWith("qwen3-") ? 2 : 3
}

export function normalizeTtsAudioFormat(
  value: string | undefined,
): TtsAudioFormat {
  return TTS_AUDIO_FORMATS.find((format) => format === value) ?? "mp3"
}
