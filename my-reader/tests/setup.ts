import { afterEach } from "vitest"
import { clearMocks } from "@tauri-apps/api/mocks"

/**
 * Keep each test isolated from previous Tauri mock state.
 */
afterEach(() => {
  clearMocks()
})
