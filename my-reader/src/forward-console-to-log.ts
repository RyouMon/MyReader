import { isTauri } from "@tauri-apps/api/core"
import { debug, error, info, trace, warn } from "@tauri-apps/plugin-log"

function formatConsoleArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a
      if (a instanceof Error) return a.stack ?? a.message
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(" ")
}

function forwardConsole(
  fnName: "log" | "debug" | "info" | "warn" | "error",
  logger: (message: string) => Promise<void>,
): void {
  const original = console[fnName].bind(console) as (...args: unknown[]) => void
  const sink = console as unknown as Record<
    string,
    (...args: unknown[]) => void
  >
  sink[fnName] = (...args: unknown[]) => {
    original(...args)
    void logger(formatConsoleArgs(args))
  }
}

/** 在 Tauri WebView 内把 `console` 输出同步到 Rust 侧 `tauri-plugin-log`。 */
export function installForwardConsoleToLog(): void {
  if (!isTauri()) return
  forwardConsole("log", trace)
  forwardConsole("debug", debug)
  forwardConsole("info", info)
  forwardConsole("warn", warn)
  forwardConsole("error", error)
}
