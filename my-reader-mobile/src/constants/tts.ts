export function ttsMaximumPlaybackSpeed(profile?: {
  kind: string
  model?: string
}) {
  // Qwen3 returns normal-speed audio. Both mobile players support up to 2×
  // time stretching; Qwen Audio Plus can also change speed during synthesis.
  return profile?.kind === "qwen" && profile.model?.startsWith("qwen3-") ? 2 : 3
}
