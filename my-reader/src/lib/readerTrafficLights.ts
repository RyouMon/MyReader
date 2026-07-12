import { isTauri } from "@tauri-apps/api/core"
import { isMacPlatform } from "@/lib/platform"
import { MACOS_READER_TRAFFIC_LIGHT_POSITION } from "@/lib/readerWindowChrome"
import { api } from "@/lib/tauri-api"

let trafficLightsSyncId = 0

function syncReaderTrafficLights(
  visible: boolean,
  reposition: boolean,
): Promise<null> {
  return api.setReaderTrafficLightsVisible(
    visible,
    MACOS_READER_TRAFFIC_LIGHT_POSITION.x,
    MACOS_READER_TRAFFIC_LIGHT_POSITION.y,
    reposition,
  )
}

export async function setReaderTrafficLightsVisible(
  visible: boolean,
): Promise<void> {
  if (!isTauri() || !isMacPlatform()) return

  const syncId = ++trafficLightsSyncId
  const sync = () => syncReaderTrafficLights(visible, true)

  await sync()

  if (!visible) return

  for (const delay of [16, 80]) {
    window.setTimeout(() => {
      if (syncId !== trafficLightsSyncId) return
      void sync().catch((e) => {
        console.error("Failed to reapply native macOS traffic lights:", e)
      })
    }, delay)
  }
}

export async function releaseReaderTrafficLightsToSystemChrome(): Promise<void> {
  if (!isTauri() || !isMacPlatform()) return

  trafficLightsSyncId += 1
  await syncReaderTrafficLights(true, false)
}
