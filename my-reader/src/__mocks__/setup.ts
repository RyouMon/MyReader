import "@testing-library/jest-dom/vitest"
import { clearMocks } from "@tauri-apps/api/mocks"
import { cleanup } from "@testing-library/react"
import i18n from "i18next"
import { afterEach, beforeEach } from "vitest"

beforeEach(async () => {
  // Existing UI fixtures assert Chinese copy independently of the app fallback.
  if (i18n.isInitialized) await i18n.changeLanguage("zh-CN")
})

afterEach(() => {
  cleanup()
  clearMocks()
})

// WebCrypto polyfill（Tauri 核心依赖）
if (typeof crypto === "undefined") {
  Object.defineProperty(global, "crypto", {
    value: {
      getRandomValues: (arr: Uint8Array) =>
        require("node:crypto").randomFillSync(arr),
    },
  })
}

// Tauri 内部桥接对象 mock
Object.defineProperty(window, "__TAURI_INTERNALS__", {
  value: {},
  writable: true,
})
