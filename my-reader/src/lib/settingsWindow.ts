import { isTauri } from "@tauri-apps/api/core"
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"

export const OPEN_TTS_PROVIDERS_EVENT = "myreader://open-tts-providers"

export async function openTtsProviderSettings(): Promise<void> {
  if (!isTauri()) {
    window.location.assign("/settings?section=ttsProviders")
    return
  }
  const main = await WebviewWindow.getByLabel("main")
  if (!main) throw new Error("MAIN_WINDOW_NOT_FOUND")
  await main.emitTo("main", OPEN_TTS_PROVIDERS_EVENT)
  await main.show()
  await main.unminimize()
  await main.setFocus()
}
