import { ttsMaximumPlaybackSpeedForProfile } from "@my-reader/tools/tts-providers"

export function ttsMaximumPlaybackSpeed(profile?: {
  kind: string
  model?: string
}) {
  return ttsMaximumPlaybackSpeedForProfile(profile)
}
