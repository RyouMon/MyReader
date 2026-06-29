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

    const listeners = new Map<string, number[]>()
    const calls: Record<string, number> = {}

    ;(window as unknown as Record<string, unknown>).__TAURI_TEST__ = {
      calls,
      emit: (event: string, payload: unknown) => {
        const callbacks =
          // @ts-expect-error - __TAURI_INTERNALS__ is not defined in the window object
          (window.__TAURI_INTERNALS__?.callbacks as
            | Map<number, (data: unknown) => void>
            | undefined) ?? new Map()
        for (const id of listeners.get(event) ?? []) {
          callbacks.get(id)?.({ event, id, payload })
        }
      },
      closeWindow: () => {
        const callbacks =
          // @ts-expect-error - __TAURI_INTERNALS__ is not defined in the window object
          (window.__TAURI_INTERNALS__?.callbacks as
            | Map<number, (data: unknown) => void>
            | undefined) ?? new Map()
        for (const id of listeners.get("tauri://close-requested") ?? []) {
          callbacks.get(id)?.({
            event: "tauri://close-requested",
            id,
            payload: null,
          })
        }
      },
    }

    // @ts-expect-error - __TAURI_INTERNALS__ is not defined in the window object
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: Record<string, unknown>) => {
        calls[cmd] = (calls[cmd] ?? 0) + 1
        if (cmd === "plugin:event|listen") {
          const event = String(args.event)
          const handler = Number(args.handler)
          listeners.set(event, [...(listeners.get(event) ?? []), handler])
          return handler
        }
        if (cmd === "plugin:event|unlisten") {
          const event = String(args.event)
          const eventId = Number(args.eventId)
          listeners.set(
            event,
            (listeners.get(event) ?? []).filter((id) => id !== eventId),
          )
          return null
        }
        if (cmd === "plugin:event|emit") {
          const event = String(args.event)
          ;(
            window as unknown as {
              __TAURI_TEST__: {
                emit: (event: string, payload: unknown) => void
              }
            }
          ).__TAURI_TEST__.emit(event, args.payload)
          return null
        }
        if (cmd === "plugin:event|emit_to") return null
        if (cmd === "plugin:window|close") {
          calls.window_close = (calls.window_close ?? 0) + 1
          return null
        }
        if (cmd === "plugin:window|set_title") return null
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
