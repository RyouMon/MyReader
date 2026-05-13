import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { clearMocks } from '@tauri-apps/api/mocks'

afterEach(() => {
  cleanup()
  clearMocks()
})

// WebCrypto polyfill（Tauri 核心依赖）
if (typeof crypto === 'undefined') {
  Object.defineProperty(global, 'crypto', {
    value: {
      getRandomValues: (arr: Uint8Array) =>
        require('node:crypto').randomFillSync(arr),
    },
  })
}

// Tauri 内部桥接对象 mock
Object.defineProperty(window, '__TAURI_INTERNALS__', {
  value: {},
  writable: true,
})
