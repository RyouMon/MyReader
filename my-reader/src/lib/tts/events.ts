import { emit } from "@tauri-apps/api/event"

export const TTS_CONFIG_CHANGED_EVENT = "myreader://tts-config-changed"

export type TtsConfigChangedPayload = {
  source?: string
}

export function notifyTtsConfigChanged(source?: string): Promise<void> {
  return emit<TtsConfigChangedPayload>(TTS_CONFIG_CHANGED_EVENT, { source })
}
