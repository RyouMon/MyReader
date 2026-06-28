import type { BrowserContext, Page } from "@playwright/test"

export type IpcHandler = (args: Record<string, unknown>) => unknown

export async function injectTauriInternals(target: Page | BrowserContext) {
  await target.addInitScript(() => {
    const existingHandlers = (
      window as unknown as Record<string, Record<string, IpcHandler>>
    ).__TAURI_IPC_HANDLERS__
    const handlers: Record<string, IpcHandler> = existingHandlers ?? {}

    ;(window as unknown as Record<string, unknown>).isTauri = true
    ;(window as unknown as Record<string, unknown>).__TAURI_IPC_HANDLERS__ =
      handlers

    // @ts-expect-error - __TAURI_INTERNALS__ is not defined in the window object
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: Record<string, unknown>) => {
        const currentHandlers =
          (window as unknown as Record<string, Record<string, IpcHandler>>)
            .__TAURI_IPC_HANDLERS__ ?? {}
        const fn = currentHandlers[cmd]
        if (!fn) {
          throw new Error(`Unhandled mock IPC command: ${cmd}`)
        }
        return fn(args)
      },
      transformCallback: (cb: (data: unknown) => void, once = false) => {
        const id = window.crypto.getRandomValues(new Uint32Array(1))[0]
        const callbacks =
          // @ts-expect-error - __TAURI_INTERNALS__ is not defined in the window object
          ((window.__TAURI_INTERNALS__ as unknown as Record<string, unknown>)
            .callbacks as Map<number, (data: unknown) => void> | undefined) ??
          new Map()
        callbacks.set(id, (data: unknown) => {
          if (once) callbacks.delete(id)
          return cb?.(data)
        })
        // @ts-expect-error - __TAURI_INTERNALS__ is not defined in the window object
        ;(
          window.__TAURI_INTERNALS__ as unknown as Record<string, unknown>
        ).callbacks = callbacks
        return id
      },
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { windowLabel: "main", label: "main" },
      },
    } as Record<string, unknown>
  })
}
